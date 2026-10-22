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

			// 1. Fetch open invoices
			const { data: openInvoices } = await this.supabase
				.from(this.INVOICES_TABLE)
				.select("id, invoice_number, amount, currency, client_id")
				.in("status", ["SENT", "PARTIALLY_PAID", "OVERDUE"])
				.eq("profile_id", profileId);

			const clientIds = openInvoices?.map((i) => i.client_id) || [];
			const { data: clientsData } = await this.supabase
				.from(this.CLIENTS_TABLE)
				.select("id, email")
				.in("id", clientIds);
			const clientEmailMap = new Map(clientsData?.map((c) => [c.id, c.email]) || []);

			const formattedInvoices = (openInvoices || []).map((inv) => ({
				id: inv.id,
				invoice_number: inv.invoice_number || "",
				amount: inv.amount,
				currency: inv.currency,
				client_email: clientEmailMap.get(inv.client_id) || "",
			}));

			// 2. Evaluate Rule Engine
			const ruleResult = runRuleEngine(
				{
					id: txn.id,
					amount: txn.amount,
					net: txn.net_amount ?? txn.amount,
					fee: txn.fee_amount ?? 0,
					currency: txn.currency,
					payer_email: txn.payer_email || "",
				},
				formattedInvoices,
			);

			const toolsService = new AgentToolsService(this.request);

			if (ruleResult.match_type !== "none" && ruleResult.confidence >= 0.9) {
				const matchRes = await toolsService.matchPayment({
					transactionId: txn.id,
					invoiceId: ruleResult.invoice_id,
					amountMatched: txn.amount,
					confidence: ruleResult.confidence,
					reasoning: ruleResult.reasoning,
				});

				await this.logAudit("rule_match_executed", "transactions", txn.id, matchRes.data);
				return { data: { action: "rule_matched", result: matchRes.data }, error: null };
			}

			// 3. Anomaly Check: Detect duplicate payments
			const { data: duplicateCheck } = await this.supabase
				.from(this.TRANSACTIONS_TABLE)
				.select("id")
				.eq("amount", txn.amount)
				.eq("payer_email", txn.payer_email || "")
				.neq("id", txn.id);

			if (duplicateCheck && duplicateCheck.length > 0) {
				await toolsService.flagAnomaly({
					entityId: txn.id,
					entityType: "transactions",
					anomalyType: "duplicate",
					anomalyReason: `Identical transaction amount ($${txn.amount}) from same payer email (${txn.payer_email}) detected.`,
					confidence: 0.92,
				});

				if ((txn.raw_paypal as any)["id"] != undefined) {
					await toolsService.proposeRefund({
						transactionId: txn.id,
						captureId: (txn.raw_paypal as any)["id"],
						amount: { currency_code: txn.currency, value: txn.amount.toString() },
						reasoning: "Duplicate payment detected by agent runner. Proposing refund.",
					});
				}
			}

			return { data: { action: "escalated_to_llm_or_review", transactionId: txn.id }, error: null };
		} catch (err: any) {
			return { data: null, error: new ApiError(err.message || "Agent runner failed", 500) };
		}
	}

	/**
	 * Cron / Routine check for overdue invoices to draft reminders
	 */
	async runOverdueCheck(): Promise<ServiceResult<any>> {
		try {
			const profileId = await this.getProfileId();
			const { data: openInvoices } = await this.supabase
				.from(this.INVOICES_TABLE)
				.select("id, invoice_number, amount, currency, due_date, client_id")
				.in("status", ["SENT", "OVERDUE"])
				.eq("profile_id", profileId);

			const overdueList = checkOverdueInvoices(openInvoices || []);
			const toolsService = new AgentToolsService(this.request);
			const draftedReminders = [];

			for (const item of overdueList) {
				const inv = openInvoices?.find((i) => i.id === item.invoiceId);
				if (inv) {
					const reminder = await toolsService.draftReminder({
						invoiceId: inv.id,
						clientId: inv.client_id,
						reasoning: `Invoice is ${item.daysOverdue} days overdue.`,
						suggestedSubject: `Friendly Reminder: Invoice #${inv.invoice_number} Payment Due`,
						suggestedNote: `Hi, this is a reminder that invoice #${inv.invoice_number} for $${inv.amount} was due on ${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "recently"}.`,
					});
					draftedReminders.push(reminder.data);
				}
			}

			return { data: { draftedReminders }, error: null };
		} catch (err: any) {
			return { data: null, error: new ApiError(err.message || "Overdue check failed", 500) };
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
