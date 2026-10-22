import { AgentService } from "~/services/agent.service.server";
import { BaseService } from "~/services/base.server.service";
import { ApiError } from "~/utils/errors/ApiError";
import { normalizePayPalEvent, mapSource } from "~/utils/paypal-normalizer.server";
import { runRuleEngine } from "~/utils/rule-engine.server";

export class IngestService extends BaseService {
	/**
	 * PayPal webhook entrypoint.
	 * Pass the FULL body so we keep event_type + top-level event id.
	 */
	async processWebhook(webhookData: { headers: Record<string, string>; body: any }) {
		const body = webhookData.body || {};
		const eventType = body.event_type || "UNKNOWN";
		// Resource is nested; event id lives on the envelope
		const resource = body.resource ?? body;

		return this.processEvent({
			envelope: body,
			resource,
			eventType,
			eventId: body.id || resource.id || `evt_${Date.now()}`,
			sourceInput: "webhook",
		});
	}

	/**
	 * Simulator / manual entrypoint
	 */
	async processSimulatorEvent(payload: any, eventType: string) {
		return this.processEvent({
			envelope: payload,
			resource: payload.resource ?? payload,
			eventType,
			eventId: payload.id || `sim_${Date.now()}`,
			sourceInput: "simulator",
		});
	}

	private async processEvent(opts: {
		envelope: any;
		resource: any;
		eventType: string;
		eventId: string;
		sourceInput: "webhook" | "simulator" | "manual";
	}) {
		const { envelope, resource: _resource, eventType, eventId, sourceInput } = opts;
		const profileId = await this.resolveProfileId();
		const source = mapSource(sourceInput);

		// 1. Always log the raw event (idempotent)
		await this.supabase.from(this.WEBHOOK_EVENTS_TABLE).upsert(
			{
				paypal_event_id: eventId,
				event_type: eventType,
				payload: envelope,
				processed: false,
				processing_error: null,
			},
			{ onConflict: "paypal_event_id" },
		);

		// 2. Normalize (may intentionally ignore)
		const normalized = normalizePayPalEvent(
			eventType,
			envelope, // pass full envelope; normalizer uses payload.resource || payload
			sourceInput,
		);

		if (normalized.ignored) {
			await this.supabase
				.from(this.WEBHOOK_EVENTS_TABLE)
				.update({
					processed: true,
					processing_error: normalized.ignoreReason ?? "ignored",
					processed_at: new Date().toISOString(),
				})
				.eq("paypal_event_id", eventId);

			return {
				success: true,
				transactionId: null,
				ignored: true,
				reason: normalized.ignoreReason,
			};
		}

		const { transaction, invoice } = normalized;
		let createdTxnId: string | null = null;

		// 3. Upsert transaction
		if (transaction) {
			const { data: txn, error } = await this.supabase
				.from(this.TRANSACTIONS_TABLE)
				.upsert(
					{
						profile_id: profileId,
						paypal_transaction_id: transaction.paypal_transaction_id,
						amount: transaction.amount,
						fee_amount: transaction.fee_amount,
						net_amount: transaction.net_amount,
						currency: transaction.currency,
						payer_email: transaction.payer_email,
						payer_name: transaction.payer_name ?? null,
						// Already normalized: completed | pending | declined | refunded | reversed
						status: transaction.status,
						type: transaction.type, // payment | refund | reversal | fee
						raw_paypal: transaction.raw_paypal,
						source,
						transaction_date: transaction.transaction_date,
					},
					{ onConflict: "paypal_transaction_id" },
				)
				.select("id, amount, net_amount, fee_amount, currency, payer_email, status, type")
				.single();

			if (error) {
				await this.markWebhookFailed(eventId, error.message);
				throw new ApiError(error.message, 500, [error]);
			}
			if (txn) createdTxnId = txn.id;
		}

		// 4. Upsert invoice
		if (invoice) {
			const clientId = await this.findOrCreateClient(profileId, {
				email: invoice.client_email,
				name: invoice.client_name,
			});

			const { error: invError } = await this.supabase.from(this.INVOICES_TABLE).upsert(
				{
					profile_id: profileId,
					client_id: clientId,
					paypal_invoice_id: invoice.paypal_invoice_id,
					invoice_number: invoice.invoice_number,
					amount: invoice.amount,
					currency: invoice.currency,
					// Already mapped by normalizer
					status: invoice.status,
					due_date: invoice.due_date,
					issue_date: invoice.issue_date ?? null,
					description: invoice.description ?? null,
					raw_paypal: invoice.raw_paypal,
					source,
				},
				{ onConflict: "paypal_invoice_id" },
			);

			if (invError) {
				await this.markWebhookFailed(eventId, invError.message);
				throw new ApiError(invError.message, 500, [invError]);
			}
		}

		// 5. Rules + agent only for completed incoming payments
		if (createdTxnId && transaction?.type === "payment" && transaction.status === "completed") {
			await this.runMatchingPipeline(profileId, createdTxnId);
		}

		// 6. Mark webhook processed
		await this.supabase
			.from(this.WEBHOOK_EVENTS_TABLE)
			.update({
				processed: true,
				processing_error: null,
				processed_at: new Date().toISOString(),
			})
			.eq("paypal_event_id", eventId);

		return {
			success: true,
			transactionId: createdTxnId,
			ignored: false,
		};
	}

	// --------------------------------------------------
	// Matching pipeline (rules → optional agent)
	// --------------------------------------------------
	private async runMatchingPipeline(profileId: string, transactionId: string) {
		const { data: txnFull } = await this.supabase
			.from(this.TRANSACTIONS_TABLE)
			.select("*")
			.eq("id", transactionId)
			.single();

		if (!txnFull) return;

		// Skip if already has an approved/proposed match (idempotent re-delivery)
		const { data: existingMatches } = await this.supabase
			.from(this.MATCHES_TABLE)
			.select("id")
			.eq("transaction_id", transactionId)
			.limit(1);

		if (existingMatches && existingMatches.length > 0) {
			return;
		}

		const { data: openInvoices } = await this.supabase
			.from(this.INVOICES_TABLE)
			.select("id, invoice_number, amount, currency, client_id")
			.in("status", ["sent", "partially_paid", "overdue"])
			.eq("profile_id", profileId);

		const clientIds = [...new Set((openInvoices || []).map((i) => i.client_id))];
		const { data: clientsData } =
			clientIds.length > 0
				? await this.supabase.from(this.CLIENTS_TABLE).select("id, email").in("id", clientIds)
				: { data: [] as { id: string; email: string | null }[] };

		const clientEmailMap = new Map((clientsData || []).map((c) => [c.id, c.email || ""]));

		const formattedInvoices = (openInvoices || []).map((inv) => ({
			id: inv.id,
			invoice_number: inv.invoice_number || "",
			amount: Number(inv.amount),
			currency: inv.currency,
			client_email: clientEmailMap.get(inv.client_id) || "",
		}));

		const ruleResult = runRuleEngine(
			{
				id: txnFull.id,
				amount: Number(txnFull.amount),
				net: Number(txnFull.net_amount ?? txnFull.amount),
				fee: Number(txnFull.fee_amount ?? 0),
				currency: txnFull.currency,
				payer_email: txnFull.payer_email || "",
			},
			formattedInvoices,
		);

		if (ruleResult.match_type !== "none" && ruleResult.confidence >= 0.9) {
			const matchedInvoice = openInvoices?.find((i) => i.id === ruleResult.invoice_id);
			const amountMatched = Number(txnFull.amount);
			const invoiceAmount = Number(matchedInvoice?.amount ?? 0);

			await this.supabase.from(this.MATCHES_TABLE).insert({
				transaction_id: txnFull.id,
				invoice_id: ruleResult.invoice_id,
				amount_matched: amountMatched,
				match_type: ruleResult.match_type,
				confidence: ruleResult.confidence,
				reasoning: ruleResult.reasoning,
				status: "approved",
				created_by: "rule_engine",
			});

			// Full vs partial
			const newStatus =
				matchedInvoice && amountMatched + 0.001 < invoiceAmount ? "partially_paid" : "paid";

			await this.supabase
				.from(this.INVOICES_TABLE)
				.update({ status: newStatus })
				.eq("id", ruleResult.invoice_id);

			return;
		}

		// Ambiguous → agent (rules found nothing strong)
		const agentService = new AgentService(this.request);
		await agentService.runForTransaction(transactionId);
	}

	// --------------------------------------------------
	// Client helpers
	// --------------------------------------------------
	private async findOrCreateClient(
		profileId: string,
		info: { email: string; name?: string },
	): Promise<string> {
		const email = (info.email || "").toLowerCase().trim();

		if (email && email !== "unknown@client.com") {
			const { data: existing } = await this.supabase
				.from(this.CLIENTS_TABLE)
				.select("id")
				.eq("profile_id", profileId)
				.eq("email", email)
				.maybeSingle();

			if (existing) return existing.id;

			const { data: created, error } = await this.supabase
				.from(this.CLIENTS_TABLE)
				.insert({
					profile_id: profileId,
					email,
					name: info.name?.trim() || email.split("@")[0] || "Unknown client",
				})
				.select("id")
				.single();

			if (error) throw new ApiError(error.message, 500, [error]);
			return created.id;
		}

		// No usable email — create/find a generic placeholder client once
		const { data: placeholder } = await this.supabase
			.from(this.CLIENTS_TABLE)
			.select("id")
			.eq("profile_id", profileId)
			.eq("email", "unknown@client.com")
			.maybeSingle();

		if (placeholder) return placeholder.id;

		const { data: created, error } = await this.supabase
			.from(this.CLIENTS_TABLE)
			.insert({
				profile_id: profileId,
				email: "unknown@client.com",
				name: info.name || "Unknown client",
			})
			.select("id")
			.single();

		if (error) throw new ApiError(error.message, 500, [error]);
		return created.id;
	}

	// --------------------------------------------------
	// Webhook / profile helpers
	// --------------------------------------------------
	private async markWebhookFailed(eventId: string, message: string) {
		await this.supabase
			.from(this.WEBHOOK_EVENTS_TABLE)
			.update({
				processed: false,
				processing_error: message,
			})
			.eq("paypal_event_id", eventId);
	}

	/**
	 * Webhooks have no user session.
	 * Prefer auth user when present (simulator from logged-in UI);
	 * otherwise fall back to first profile (hackathon/demo).
	 */
	private async resolveProfileId(): Promise<string> {
		try {
			const {
				data: { user },
			} = await this.supabase.auth.getUser();
			if (user?.id) return user.id;
		} catch {
			// unauthenticated webhook
		}

		const { data: profile } = await this.supabase
			.from(this.PROFILES_TABLE)
			.select("id")
			.limit(1)
			.maybeSingle();

		if (profile?.id) return profile.id;

		throw new ApiError("No profile available for webhook ingestion. Seed a demo user first.", 401);
	}
}
