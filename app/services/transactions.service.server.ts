import { BaseService } from "~/services/base.server.service";
import type { Database } from "~/types/database";
import { ApiError } from "~/utils/errors/ApiError";

type ServiceResult<T> = {
	data: T | null;
	error: ApiError | null;
};

export type TransactionFilters = {
	search?: string; // searches payer_name, payer_email, paypal_transaction_id
	matchStatus?: "matched" | "unmatched" | "proposed" | "all";
	hasAnomaly?: boolean;
	clientId?: string;
	source?: "paypal" | "simulator" | "all";
	startDate?: string; // ISO date
	endDate?: string;
	page?: number;
	pageSize?: number;
};

type Annotation = Database["public"]["Tables"]["annotations"]["Update"];
type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
type Matches = Database["public"]["Tables"]["matches"]["Update"];

export class TransactionService extends BaseService {
	/**
	 * List / search transactions with filters (used by AG Grid)
	 */
	async list(filters: TransactionFilters = {}): Promise<
		ServiceResult<{
			rows: (Transaction & {
				annotations: Annotation[];
				matches: Matches[];
				client: {
					id: string;
					name: string;
					email: string | null;
				} | null;
			})[];
			total: number;
		}>
	> {
		try {
			const {
				search,
				matchStatus = "all",
				hasAnomaly,
				clientId,
				source = "all",
				startDate,
				endDate,
				page = 1,
				pageSize = 100,
			} = filters;

			const profileId = await this.getProfileId();

			// 1. Main transactions query (no annotations join)
			let query = this.supabase
				.from(this.TRANSACTIONS_TABLE)
				.select(
					`
                    *,
                    client:clients ( id, name, email ),
                    matches (
                        id,
                        invoice_id,
                        amount_matched,
                        match_type,
                        confidence,
                        reasoning,
                        status,
                        invoice:invoices ( id, invoice_number, amount, status )
                    )
                `,
					{ count: "exact" },
				)
				.eq("profile_id", profileId)
				.order("transaction_date", { ascending: false });

			// Search
			if (search && search.trim()) {
				const term = `%${search.trim()}%`;
				query = query.or(
					`payer_name.ilike.${term},payer_email.ilike.${term},paypal_transaction_id.ilike.${term}`,
				);
			}

			// Client filter
			if (clientId) {
				query = query.eq("client_id", clientId);
			}

			// Source filter
			if (source !== "all") {
				query = query.eq("source", source);
			}

			// Date range
			if (startDate) {
				query = query.gte("transaction_date", startDate);
			}
			if (endDate) {
				query = query.lte("transaction_date", endDate);
			}

			// Pagination
			const from = (page - 1) * pageSize;
			const to = from + pageSize - 1;
			query = query.range(from, to);

			const { data, error, count } = await query;

			if (error) {
				return {
					data: null,
					error: new ApiError(error.message, 500, [error]),
				};
			}

			const transactions = data ?? [];

			// 2. Fetch annotations for these transactions (polymorphic)
			const transactionIds = transactions.map((t) => t.id);

			let annotationsMap: Record<string, Annotation[]> = {};

			if (transactionIds.length > 0) {
				const { data: annotations, error: annError } = await this.supabase
					.from(this.ANNOTATIONS_TABLE)
					.select(
						"id, entity_id, category, anomaly_type, anomaly_reason, confidence, created_by, created_at",
					)
					.eq("entity_type", "transaction")
					.in("entity_id", transactionIds);

				if (annError) {
					return {
						data: null,
						error: new ApiError(annError.message, 500, [annError]),
					};
				}

				// Group by entity_id
				annotationsMap = (annotations || []).reduce(
					(acc, ann) => {
						if (!acc[ann.entity_id]) acc[ann.entity_id] = [];
						acc[ann.entity_id].push(ann);
						return acc;
					},
					{} as Record<string, Annotation[]>,
				);
			}

			// 3. Attach annotations to each transaction
			let rows = transactions.map((tx) => ({
				...tx,
				annotations: annotationsMap[tx.id] || [],
			}));

			// 4. Post-filters that depend on matches / annotations
			if (matchStatus !== "all") {
				rows = rows.filter((tx) => {
					const matches = tx.matches || [];
					const hasApproved = matches.some((m) => m.status === "approved");
					const hasProposed = matches.some((m) => m.status === "proposed");

					if (matchStatus === "matched") return hasApproved;
					if (matchStatus === "proposed") return hasProposed && !hasApproved;
					if (matchStatus === "unmatched") return matches.length === 0;
					return true;
				});
			}

			if (hasAnomaly === true) {
				rows = rows.filter((tx) => (tx.annotations || []).some((a) => a.anomaly_type));
			} else if (hasAnomaly === false) {
				rows = rows.filter((tx) => !(tx.annotations || []).some((a) => a.anomaly_type));
			}

			return {
				data: {
					rows,
					total: count ?? rows.length,
				},
				error: null,
			};
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to list transactions", 500),
			};
		}
	}

	/**
	 * Get a single transaction with full details
	 */
	async getById(id: string): Promise<
		ServiceResult<
			Transaction & {
				client: {
					id: string;
					name: string;
					email: string | null;
					paypal_payer_id: string | null;
				} | null;
				matches: Matches[];
				annotations: Annotation[];
			}
		>
	> {
		try {
			const profileId = await this.getProfileId();

			// 1. Fetch the transaction + client + matches
			const { data: transaction, error } = await this.supabase
				.from(this.TRANSACTIONS_TABLE)
				.select(
					`
				*,
				client:clients ( id, name, email, paypal_payer_id ),
				matches (
					id,
					invoice_id,
					amount_matched,
					match_type,
					confidence,
					reasoning,
					status,
					created_by,
					created_at,
					invoice:invoices ( id, invoice_number, amount, status, due_date )
				)
			`,
				)
				.eq("id", id)
				.eq("profile_id", profileId)
				.single();

			if (error) {
				return {
					data: null,
					error: new ApiError(error.message, error.code === "PGRST116" ? 404 : 500, [error]),
				};
			}

			// 2. Fetch annotations for this transaction (polymorphic)
			const { data: annotations, error: annError } = await this.supabase
				.from(this.ANNOTATIONS_TABLE)
				.select("id, category, anomaly_type, anomaly_reason, confidence, created_by, created_at")
				.eq("entity_type", "transaction")
				.eq("entity_id", id);

			if (annError) {
				return {
					data: null,
					error: new ApiError(annError.message, 500, [annError]),
				};
			}

			// 3. Attach annotations
			const result = {
				...transaction,
				annotations: annotations || [],
			};

			return { data: result, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to get transaction", 500),
			};
		}
	}

	/**
	 * Helper – get current user's profile_id
	 */
	private async getProfileId(): Promise<string> {
		const {
			data: { user },
			error,
		} = await this.supabase.auth.getUser();

		if (error || !user) {
			throw new ApiError("Unauthorized", 401);
		}

		return user.id;
	}
}
