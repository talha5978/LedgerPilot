import { BaseService } from "~/services/base.server.service";
import { PayPalService } from "~/services/paypal.service.server";
import type { Database } from "~/types/database";
import type { ServiceResult } from "~/types/service-result";
import { ApiError } from "~/utils/errors/ApiError";

type PendingAction = Database["public"]["Tables"]["pending_actions"]["Row"];

export type PendingActionWithDetails = PendingAction & {
	invoice?: {
		id: string;
		invoice_number: string | null;
		amount: number;
		currency: string;
		client_id: string;
		status: string;
	} | null;
	transaction?: {
		id: string;
		paypal_transaction_id: string | null;
		amount: number;
		currency: string;
		payer_email: string | null;
		payer_name: string | null;
	} | null;
};

export class ApprovalsService extends BaseService {
	/**
	 * List all pending actions for the current user's profile
	 */
	async listPending(): Promise<ServiceResult<PendingActionWithDetails[]>> {
		try {
			const profileId = await this.getProfileId();

			const { data, error } = await this.supabase
				.from(this.PENDING_ACTIONS_TABLE)
				.select(
					`
          *,
          invoice:invoices!pending_actions_related_invoice_id_fkey (
            id, invoice_number, amount, currency, client_id, status
          ),
          transaction:transactions!pending_actions_related_transaction_id_fkey (
            id, paypal_transaction_id, amount, currency, payer_email, payer_name
          )
        `,
				)
				.eq("profile_id", profileId)
				.eq("status", "pending")
				.order("proposed_at", { ascending: false });

			if (error) {
				return { data: null, error: new ApiError(error.message, 500, [error]) };
			}

			return { data: data || [], error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to list pending actions", 500),
			};
		}
	}

	/**
	 * Approve a proposed action, execute it via PayPalService, update DB, and write audit_log
	 */
	async approveAction(actionId: string): Promise<ServiceResult<{ success: boolean; result: any }>> {
		try {
			const profileId = await this.getProfileId();
			const userId = await this.getUserId();

			// 1. Fetch pending action record
			const { data: actionRecord, error } = await this.supabase
				.from(this.PENDING_ACTIONS_TABLE)
				.select("*")
				.eq("id", actionId)
				.eq("profile_id", profileId)
				.single();

			if (error || !actionRecord) {
				return { data: null, error: new ApiError("Pending action not found", 404) };
			}

			const payload = actionRecord.payload as any;
			const paypal = new PayPalService();
			let paypalResult: any = null;

			// 2. Dispatch side effect to PayPalService based on action_type
			if (actionRecord.action_type === "send_invoice_reminder" && actionRecord.related_invoice_id) {
				const { data: inv } = await this.supabase
					.from(this.INVOICES_TABLE)
					.select("paypal_invoice_id")
					.eq("id", actionRecord.related_invoice_id)
					.single();

				if (inv?.paypal_invoice_id) {
					const res = await paypal.sendInvoiceReminder(inv.paypal_invoice_id, {
						subject: payload?.subject,
						note: payload?.note,
					});
					if (res.error) throw res.error;
					paypalResult = res.data;
				}
			} else if (actionRecord.action_type === "refund_capture") {
				const res = await paypal.refundCapture(payload.capture_id, {
					amount: payload.amount,
				});
				if (res.error) throw res.error;
				paypalResult = res.data;
			}

			// 3. Update pending_actions record status
			const now = new Date().toISOString();
			await this.supabase
				.from(this.PENDING_ACTIONS_TABLE)
				.update({
					status: "executed",
					decided_at: now,
					decided_by: userId,
				})
				.eq("id", actionId);

			// 4. Log to audit_log
			await this.supabase.from(this.AUDIT_LOGS_TABLE).insert({
				profile_id: profileId,
				action_type: `${actionRecord.action_type}_approved`,
				entity_type: "pending_actions",
				entity_id: actionId,
				performed_by: "user",
				result: "success",
				details: paypalResult || { status: "executed" },
			});

			return { data: { success: true, result: paypalResult }, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to approve action", 500),
			};
		}
	}

	/**
	 * Reject a proposed action (no PayPal call, just update status + audit_log)
	 */
	async rejectAction(actionId: string): Promise<ServiceResult<{ success: boolean }>> {
		try {
			const profileId = await this.getProfileId();
			const userId = await this.getUserId();

			const now = new Date().toISOString();
			const { error } = await this.supabase
				.from(this.PENDING_ACTIONS_TABLE)
				.update({
					status: "rejected",
					decided_at: now,
					decided_by: userId,
				})
				.eq("id", actionId)
				.eq("profile_id", profileId);

			if (error) {
				return { data: null, error: new ApiError(error.message, 500, [error]) };
			}

			// Write to audit log
			await this.supabase.from(this.AUDIT_LOGS_TABLE).insert({
				profile_id: profileId,
				action_type: "action_rejected",
				entity_type: "pending_actions",
				entity_id: actionId,
				performed_by: "user",
				result: "rejected",
				details: { actionId },
			});

			return { data: { success: true }, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to reject action", 500),
			};
		}
	}

	private async getProfileId(): Promise<string> {
		const {
			data: { user },
			error,
		} = await this.supabase.auth.getUser();
		if (error || !user) throw new ApiError("Unauthorized", 401);
		return user.id;
	}

	private async getUserId(): Promise<string> {
		const {
			data: { user },
			error,
		} = await this.supabase.auth.getUser();
		if (error || !user) throw new ApiError("Unauthorized", 401);
		return user.id;
	}
}
