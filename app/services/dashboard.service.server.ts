import { BaseService } from "~/services/base.server.service";
import { ApiError } from "~/utils/errors/ApiError";

export class DashboardService extends BaseService {
	async getDashboard() {
		const profileId = await this.getProfileId();
		const now = new Date();
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

		const [txMonth, openInvoices, pending, recentTx, recentAudit, anomalies, unmatched] =
			await Promise.all([
				this.supabase
					.from(this.TRANSACTIONS_TABLE)
					.select("amount, net_amount, fee_amount, type, status")
					.eq("profile_id", profileId)
					.eq("type", "payment")
					.gte("transaction_date", monthStart),

				this.supabase
					.from(this.INVOICES_TABLE)
					.select("id, invoice_number, amount, status, due_date, client:clients(name)")
					.eq("profile_id", profileId)
					.in("status", ["sent", "partially_paid", "overdue"]),

				this.supabase
					.from(this.PENDING_ACTIONS_TABLE)
					.select(
						"id, action_type, reasoning, status, proposed_at, related_invoice_id, related_transaction_id",
					)
					.eq("profile_id", profileId)
					.eq("status", "pending")
					.order("proposed_at", { ascending: false })
					.limit(8),

				this.supabase
					.from(this.TRANSACTIONS_TABLE)
					.select(
						"id, amount, currency, payer_name, payer_email, status, transaction_date, source, client:clients(name)",
					)
					.eq("profile_id", profileId)
					.order("transaction_date", { ascending: false })
					.limit(6),

				this.supabase
					.from(this.AUDIT_LOGS_TABLE)
					.select("id, action_type, entity_type, performed_by, result, created_at, details")
					.eq("profile_id", profileId)
					.order("created_at", { ascending: false })
					.limit(8),

				this.supabase
					.from(this.ANNOTATIONS_TABLE)
					.select("id, entity_id, anomaly_type, anomaly_reason, confidence, created_at")
					.eq("entity_type", "transaction")
					.not("anomaly_type", "is", null)
					.order("created_at", { ascending: false })
					.limit(5),

				// unmatched-ish: recent payments with no approved match — approximate via left logic in JS below
				this.supabase
					.from(this.TRANSACTIONS_TABLE)
					.select("id, amount, payer_email, matches(id, status)")
					.eq("profile_id", profileId)
					.eq("type", "payment")
					.order("transaction_date", { ascending: false })
					.limit(40),
			]);

		const payments = txMonth.data || [];
		const receivedGross = payments.reduce((s, t) => s + Number(t.amount || 0), 0);
		const receivedNet = payments.reduce((s, t) => s + Number(t.net_amount ?? t.amount ?? 0), 0);
		const fees = payments.reduce((s, t) => s + Number(t.fee_amount || 0), 0);

		const invoices = openInvoices.data || [];
		const openTotal = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
		const overdueInvoices = invoices.filter((i) => {
			if (i.status === "overdue") return true;
			if (!i.due_date) return false;
			return new Date(i.due_date) < now && i.status !== "paid";
		});
		const overdueTotal = overdueInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);

		const unmatchedCount = (unmatched.data || []).filter((t) => {
			const m = t.matches || [];
			return !m.some((x: any) => x.status === "approved");
		}).length;

		return {
			kpis: {
				receivedGross,
				receivedNet,
				fees,
				openTotal,
				openCount: invoices.length,
				overdueTotal,
				overdueCount: overdueInvoices.length,
				pendingCount: pending.data?.length ?? 0,
				unmatchedCount,
				paymentCount: payments.length,
			},
			pending: pending.data || [],
			recentTx: recentTx.data || [],
			recentAudit: recentAudit.data || [],
			anomalies: anomalies.data || [],
			overdueInvoices: overdueInvoices.slice(0, 5),
		};
	}

	private async getProfileId() {
		const {
			data: { user },
		} = await this.supabase.auth.getUser();
		if (!user) throw new ApiError("Unauthorized", 401);
		return user.id;
	}
}
