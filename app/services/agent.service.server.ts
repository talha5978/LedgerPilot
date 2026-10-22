// app/services/agent.service.server.ts
import { BaseService } from "~/services/base.server.service";
import { checkOverdueInvoices, runRuleEngine } from "~/utils/rule-engine.server";
import { ApiError } from "~/utils/errors/ApiError";
import { AgentToolsService } from "~/services/agent.tools.server";
import { GeminiService } from "~/services/gemini.service.server";
import type { ServiceResult } from "~/types/service-result";

type LlmDecision = {
	matches?: Array<{
		invoice_id: string;
		amount_matched: number;
		confidence: number;
		reasoning: string;
	}>;
	category?: string | null;
	anomaly?: {
		type: string;
		reason: string;
		confidence: number;
	} | null;
	notes?: string;
};

export class AgentService extends BaseService {
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
			let simplePartialHandled = false;

			// Strong rule match
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

			// ----- Deterministic agent checks (no LLM) -----

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
					confidence: 0.85,
					reasoning: `Partial payment: $${txn.amount} toward invoice #${inv.invoice_number} ($${inv.amount}). Remaining $${(inv.amount - Number(txn.amount)).toFixed(2)}.`,
				});
				if (inv.client_id) {
					await this.supabase
						.from(this.TRANSACTIONS_TABLE)
						.update({ client_id: inv.client_id })
						.eq("id", txn.id);
				}
				actions.push("partial_proposed");
				simplePartialHandled = true;
			}

			// ----- LLM only if still ambiguous and we have invoices to reason about -----
			const needsLlm =
				!simplePartialHandled && formattedInvoices.length > 0 && ruleResult.match_type === "none";

			if (needsLlm) {
				const llmResult = await this.runLlmReconciliation({
					txn,
					openInvoices: formattedInvoices,
					toolsService,
				});
				if (llmResult.actions.length) {
					actions.push(...llmResult.actions);
				}
				if (llmResult.error) {
					actions.push("llm_error");
				}
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
	 * Light Gemini pass — structured JSON only, then execute via tools.
	 */
	private async runLlmReconciliation(ctx: {
		txn: any;
		openInvoices: Array<{
			id: string;
			invoice_number: string;
			amount: number;
			currency: string;
			client_email: string;
			client_id: string;
		}>;
		toolsService: AgentToolsService;
	}): Promise<{ actions: string[]; error?: string }> {
		const actions: string[] = [];
		const gemini = new GeminiService();

		const system = `You are LedgerPilot, a payment reconciliation helper.
Return ONLY valid JSON. No markdown.
Task: suggest how to allocate this payment to open invoices.
Rules:
- Only use invoice ids from the provided list.
- amount_matched values must sum to <= payment amount.
- confidence 0 to 1. Use < 0.9 when unsure.
- Prefer splitting a bulk payment across invoices from the same payer email when amounts add up.
- category: short label like "Web Design" or null.
- anomaly: null unless something looks wrong.
JSON shape:
{
  "matches": [{"invoice_id":"...","amount_matched":0,"confidence":0.8,"reasoning":"..."}],
  "category": "string or null",
  "anomaly": {"type":"...","reason":"...","confidence":0.8} or null,
  "notes": "optional"
}`;

		const user = JSON.stringify({
			payment: {
				id: ctx.txn.id,
				amount: Number(ctx.txn.amount),
				fee: Number(ctx.txn.fee_amount ?? 0),
				net: Number(ctx.txn.net_amount ?? ctx.txn.amount),
				currency: ctx.txn.currency,
				payer_email: ctx.txn.payer_email,
				payer_name: ctx.txn.payer_name,
			},
			open_invoices: ctx.openInvoices.map((i) => ({
				id: i.id,
				invoice_number: i.invoice_number,
				amount: i.amount,
				currency: i.currency,
				client_email: i.client_email,
			})),
		});

		const { data: decision, error } = await gemini.generateJson<LlmDecision>({
			system,
			user,
			temperature: 0.1,
		});

		if (error || !decision) {
			return { actions, error: error?.message || "LLM failed" };
		}

		const allowedIds = new Set(ctx.openInvoices.map((i) => i.id));
		const paymentAmount = Number(ctx.txn.amount);

		for (const m of decision.matches || []) {
			if (!allowedIds.has(m.invoice_id)) continue;
			const amount = Number(m.amount_matched);
			if (!(amount > 0) || amount > paymentAmount + 0.01) continue;

			const confidence = Math.min(1, Math.max(0, Number(m.confidence) || 0.7));

			await ctx.toolsService.matchPayment({
				transactionId: ctx.txn.id,
				invoiceId: m.invoice_id,
				amountMatched: amount,
				confidence,
				reasoning: m.reasoning || "LLM suggested match",
			});

			const inv = ctx.openInvoices.find((i) => i.id === m.invoice_id);
			if (inv?.client_id) {
				await this.supabase
					.from(this.TRANSACTIONS_TABLE)
					.update({ client_id: inv.client_id })
					.eq("id", ctx.txn.id);
			}
			actions.push("llm_match");
		}

		if (decision.category) {
			await ctx.toolsService.categorize({
				entityId: ctx.txn.id,
				entityType: "transaction",
				category: String(decision.category).slice(0, 80),
				confidence: 0.75,
			});
			actions.push("llm_categorize");
		}

		if (decision.anomaly?.type) {
			await ctx.toolsService.flagAnomaly({
				entityId: ctx.txn.id,
				entityType: "transaction",
				anomalyType: String(decision.anomaly.type).slice(0, 64),
				anomalyReason: String(decision.anomaly.reason || "LLM flagged anomaly"),
				confidence: Math.min(1, Number(decision.anomaly.confidence) || 0.7),
			});
			actions.push("llm_anomaly");
		}

		await this.logAudit("llm_reconciliation", "transaction", ctx.txn.id, decision);
		return { actions };
	}

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
