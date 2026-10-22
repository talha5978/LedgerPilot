import { BaseService } from "~/services/base.server.service";
import { ApiError } from "~/utils/errors/ApiError";

export class AgentToolsService extends BaseService {
	/**
	 * 1. match_payment: Link a transaction to an invoice
	 */
	async matchPayment(params: {
		transactionId: string;
		invoiceId: string;
		amountMatched: number;
		confidence: number;
		reasoning: string;
	}) {
		const { data, error } = await this.supabase
			.from(this.MATCHES_TABLE)
			.insert({
				transaction_id: params.transactionId,
				invoice_id: params.invoiceId,
				amount_matched: params.amountMatched,
				match_type: "agent_fuzzy",
				confidence: params.confidence,
				reasoning: params.reasoning,
				status: params.confidence >= 0.9 ? "approved" : "proposed",
				created_by: "agent",
			})
			.select()
			.single();

		if (error) throw new ApiError(error.message, 500);

		if (params.confidence >= 0.9) {
			await this.supabase
				.from(this.INVOICES_TABLE)
				.update({ status: "PAID" })
				.eq("id", params.invoiceId);

			await this.supabase
				.from(this.TRANSACTIONS_TABLE)
				.update({ status: "matched" }) // Ensure column exists or update matching state
				.eq("id", params.transactionId);
		}

		return { data, error: null };
	}

	/**
	 * 2. categorize: Assign a category annotation
	 */
	async categorize(params: { entityId: string; entityType: string; category: string; confidence: number }) {
		const { data, error } = await this.supabase
			.from(this.ANNOTATIONS_TABLE)
			.insert({
				entity_id: params.entityId,
				entity_type: params.entityType,
				category: params.category,
				confidence: params.confidence,
				created_by: "agent",
			})
			.select()
			.single();

		if (error) throw new ApiError(error.message, 500);
		return { data, error: null };
	}

	/**
	 * 3. flag_anomaly: Mark anomaly on entity
	 */
	async flagAnomaly(params: {
		entityId: string;
		entityType: string;
		anomalyType: string;
		anomalyReason: string;
		confidence: number;
	}) {
		const { data, error } = await this.supabase
			.from(this.ANNOTATIONS_TABLE)
			.insert({
				entity_id: params.entityId,
				entity_type: params.entityType,
				anomaly_type: params.anomalyType,
				anomaly_reason: params.anomalyReason,
				confidence: params.confidence,
				created_by: "agent",
			})
			.select()
			.single();

		if (error) throw new ApiError(error.message, 500);
		return { data, error: null };
	}

	/**
	 * 4. draft_reminder: Propose reminder (writes to pending_actions)
	 */
	async draftReminder(params: {
		invoiceId: string;
		clientId: string;
		reasoning: string;
		suggestedSubject: string;
		suggestedNote: string;
	}) {
		const profileId = await this.getProfileId();
		const { data, error } = await this.supabase
			.from(this.PENDING_ACTIONS_TABLE)
			.insert({
				profile_id: profileId,
				action_type: "send_invoice_reminder",
				status: "pending",
				related_invoice_id: params.invoiceId,
				payload: {
					client_id: params.clientId,
					subject: params.suggestedSubject,
					note: params.suggestedNote,
				},
				reasoning: params.reasoning,
			})
			.select()
			.single();

		if (error) throw new ApiError(error.message, 500);
		return { data, error: null };
	}

	/**
	 * 5. propose_refund: Propose a refund (writes to pending_actions)
	 */
	async proposeRefund(params: {
		transactionId: string;
		captureId: string;
		amount: { currency_code: string; value: string };
		reasoning: string;
	}) {
		const profileId = await this.getProfileId();
		const { data, error } = await this.supabase
			.from(this.PENDING_ACTIONS_TABLE)
			.insert({
				profile_id: profileId,
				action_type: "refund_capture",
				status: "pending",
				related_transaction_id: params.transactionId,
				payload: {
					capture_id: params.captureId,
					amount: params.amount,
				},
				reasoning: params.reasoning,
			})
			.select()
			.single();

		if (error) throw new ApiError(error.message, 500);
		return { data, error: null };
	}

	/**
	 * 6. assign_client: Propose client assignment (writes to pending_actions)
	 */
	async assignClient(params: { transactionId: string; clientId: string; reasoning: string }) {
		const profileId = await this.getProfileId();
		const { data, error } = await this.supabase
			.from(this.PENDING_ACTIONS_TABLE)
			.insert({
				profile_id: profileId,
				action_type: "assign_client",
				status: "pending",
				related_transaction_id: params.transactionId,
				payload: {
					client_id: params.clientId,
				},
				reasoning: params.reasoning,
			})
			.select()
			.single();

		if (error) throw new ApiError(error.message, 500);
		return { data, error: null };
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
