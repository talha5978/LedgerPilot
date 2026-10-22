import { BaseService } from "~/services/base.server.service";
import { checkOverdueInvoices, runRuleEngine } from "~/utils/rule-engine.server";
import { ApiError } from "~/utils/errors/ApiError";
import { AgentToolsService } from "~/services/agent.tools.server";
import type { ServiceResult } from "~/types/service-result";

export class AgentService extends BaseService {
	/**
	 * Runs agent logic for a specific transaction (matching, anomaly detection)
	 */
	async runForTransaction(transactionId: string): Promise<ServiceResult<any>> {
		try {
			const profileId = await this.getProfileId();

			const { data: txn, error: txnError } = await this.supabase
				.from(this.TRANSACTIONS_TABLE)
				.select("*")
				.eq("id", transactionId)
				.eq("profile_id", profileId)
				.single();

			if (txnError || !txn) {
				return { data: null, error: new ApiError("Transaction not found", 404) };
			}

			// 1. Open invoices — MUST use schema lowercase statuses
			const { data: openInvoices } = await this.supabase
				.from(this.INVOICES_TABLE)
				.select("id, invoice_number, amount, currency, client_id")
				.in("status", ["sent", "partially_paid", "overdue"])
				.eq("profile_id", profileId);

			const clientIds = [...new Set((openInvoices || []).map((i) => i.client_id))];
			const { data: clientsData } =
				clientIds.length > 0
					? await this.supabase
							.from(this.CLIENTS_TABLE)
							.select("id, email, name")
							.in("id", clientIds)
					: { data: [] as { id: string; email: string | null; name: string }[] };

			const clientEmailMap = new Map(
				(clientsData || []).map((c) => [c.id, (c.email || "").toLowerCase()]),
			);

			const formattedInvoices = (openInvoices || []).map((inv) => ({
				id: inv.id,
				invoice_number: inv.invoice_number || "",
				amount: Number(inv.amount),
				currency: inv.currency,
				client_email: clientEmailMap.get(inv.client_id) || "",
				client_id: inv.client_id,
			}));

			// 2. Rule engine
			const ruleResult = runRuleEngine(
				{
					id: txn.id,
					amount: Number(txn.amount),
					net: Number(txn.net_amount ?? txn.amount),
					fee: Number(txn.fee_amount ?? 0),
					currency: txn.currency,
					payer_email: (txn.payer_email || "").toLowerCase(),
				},
				formattedInvoices,
			);

			const toolsService = new AgentToolsService(this.request);
			const actions: string[] = [];

			// Strong rule match → apply via tools
			if (ruleResult.match_type !== "none" && ruleResult.confidence >= 0.9) {
				const matchRes = await toolsService.matchPayment({
					transactionId: txn.id,
					invoiceId: ruleResult.invoice_id,
					amountMatched: Number(txn.amount),
					confidence: ruleResult.confidence,
					reasoning: ruleResult.reasoning,
				});

				const inv = formattedInvoices.find((i) => i.id === ruleResult.invoice_id);
				if (inv?.client_id) {
					await this.supabase
						.from(this.TRANSACTIONS_TABLE)
						.update({ client_id: inv.client_id })
						.eq("id", txn.id);
				}

				await this.logAudit("rule_match_executed", "transaction", txn.id, matchRes.data);
				return {
					data: { action: "rule_matched", result: matchRes.data },
					error: null,
				};
			}

			// ----- Agent reviews (no strong rule match) -----

			// 3. Link client by payer email if known
			const payerEmail = (txn.payer_email || "").toLowerCase().trim();
			if (payerEmail) {
				const { data: knownClient } = await this.supabase
					.from(this.CLIENTS_TABLE)
					.select("id, name, email")
					.eq("profile_id", profileId)
					.ilike("email", payerEmail)
					.maybeSingle();

				if (knownClient) {
					await this.supabase
						.from(this.TRANSACTIONS_TABLE)
						.update({ client_id: knownClient.id })
						.eq("id", txn.id);
				} else {
					await toolsService.flagAnomaly({
						entityId: txn.id,
						entityType: "transaction",
						anomalyType: "unknown_payer",
						anomalyReason: `No client found for payer email ${payerEmail}.`,
						confidence: 0.85,
					});
					actions.push("unknown_payer");
				}
			}

			// 4. Fee spike — fee ≥ 5% of gross (typical PayPal ~2.9%)
			const gross = Number(txn.amount) || 0;
			const fee = Number(txn.fee_amount) || 0;
			const feeRatio = gross > 0 ? fee / gross : 0;

			if (gross > 0 && feeRatio >= 0.05) {
				await toolsService.flagAnomaly({
					entityId: txn.id,
					entityType: "transaction",
					anomalyType: "fee_spike",
					anomalyReason: `Fee $${fee.toFixed(2)} is ${(feeRatio * 100).toFixed(1)}% of gross $${gross.toFixed(2)} (expected ~2.9–3.5%).`,
					confidence: 0.91,
				});
				actions.push("fee_spike");
			}

			// 5. Duplicate — same amount + email, other payment rows
			const { data: duplicateCheck } = await this.supabase
				.from(this.TRANSACTIONS_TABLE)
				.select("id, paypal_transaction_id, transaction_date")
				.eq("profile_id", profileId)
				.eq("amount", txn.amount)
				.eq("payer_email", txn.payer_email || "")
				.eq("type", "payment")
				.neq("id", txn.id)
				.limit(5);

			if (duplicateCheck && duplicateCheck.length > 0) {
				await toolsService.flagAnomaly({
					entityId: txn.id,
					entityType: "transaction",
					anomalyType: "duplicate",
					anomalyReason: `Identical amount ($${txn.amount}) from same payer (${txn.payer_email}) as existing payment(s).`,
					confidence: 0.92,
				});
				actions.push("duplicate");

				const raw = txn.raw_paypal as any;
				const captureId = raw?.resource?.id || raw?.id || txn.paypal_transaction_id;

				if (captureId) {
					await toolsService.proposeRefund({
						transactionId: txn.id,
						captureId: String(captureId),
						amount: {
							currency_code: txn.currency,
							value: String(txn.amount),
						},
						reasoning: "Possible duplicate payment detected. Refund proposed for human approval.",
					});
					actions.push("propose_refund");
				}
			}

			// 6. Partial payment proposal — one open invoice, same email, amount < invoice
			const partialCandidates = formattedInvoices.filter(
				(inv) =>
					inv.client_email === payerEmail &&
					Number(txn.amount) > 0 &&
					Number(txn.amount) < inv.amount,
			);

			if (partialCandidates.length === 1) {
				const inv = partialCandidates[0];
				await toolsService.matchPayment({
					transactionId: txn.id,
					invoiceId: inv.id,
					amountMatched: Number(txn.amount),
					confidence: 0.85, // proposed, not auto-approved
					reasoning: `Partial payment: $${txn.amount} toward invoice #${inv.invoice_number} ($${inv.amount}). Remaining $${(inv.amount - Number(txn.amount)).toFixed(2)}.`,
				});
				if (inv.client_id) {
					await this.supabase
						.from(this.TRANSACTIONS_TABLE)
						.update({ client_id: inv.client_id })
						.eq("id", txn.id);
				}
				actions.push("partial_proposed");
			}

			await this.logAudit("agent_reviewed", "transaction", txn.id, { actions });

			return {
				data: {
					action: "agent_reviewed",
					transactionId: txn.id,
					actions,
				},
				error: null,
			};
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Agent runner failed", 500),
			};
		}
	}

	/**
	 * Draft reminders for overdue invoices → pending_actions
	 */
	async runOverdueCheck(): Promise<ServiceResult<any>> {
		try {
			const profileId = await this.getProfileId();

			const { data: openInvoices } = await this.supabase
				.from(this.INVOICES_TABLE)
				.select("id, invoice_number, amount, currency, due_date, client_id")
				.in("status", ["sent", "overdue", "partially_paid"])
				.eq("profile_id", profileId);

			const overdueList = checkOverdueInvoices(openInvoices || []);
			const toolsService = new AgentToolsService(this.request);
			const draftedReminders = [];

			for (const item of overdueList) {
				const inv = openInvoices?.find((i) => i.id === item.invoiceId);
				if (!inv) continue;

				// Skip if a pending reminder already exists for this invoice
				const { data: existing } = await this.supabase
					.from(this.PENDING_ACTIONS_TABLE)
					.select("id")
					.eq("profile_id", profileId)
					.eq("related_invoice_id", inv.id)
					.eq("action_type", "send_invoice_reminder")
					.eq("status", "pending")
					.maybeSingle();

				if (existing) continue;

				const reminder = await toolsService.draftReminder({
					invoiceId: inv.id,
					clientId: inv.client_id,
					reasoning: `Invoice is ${item.daysOverdue} day(s) overdue.`,
					suggestedSubject: `Friendly reminder: Invoice #${inv.invoice_number}`,
					suggestedNote: `Hi, this is a reminder that invoice #${inv.invoice_number} for $${inv.amount} was due on ${
						inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "recently"
					}.`,
				});
				draftedReminders.push(reminder.data);
			}

			return { data: { draftedReminders }, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Overdue check failed", 500),
			};
		}
	}

	private async logAudit(action_type: string, entity_type: string, entity_id: string, details: any) {
		const profileId = await this.getProfileId();
		await this.supabase.from(this.AUDIT_LOGS_TABLE).insert({
			profile_id: profileId,
			action_type,
			entity_type,
			entity_id,
			performed_by: "agent",
			result: "success",
			details,
		});
	}

	private async getProfileId(): Promise<string> {
		const {
			data: { user },
			error,
		} = await this.supabase.auth.getUser();
		if (error || !user) throw new ApiError("Unauthorized", 401);
		return user.id;
	}
}
