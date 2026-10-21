import { BaseService } from "~/services/base.server.service";
import type { Database } from "~/types/database";
import { ApiError } from "~/utils/errors/ApiError";

type ServiceResult<T> = {
	data: T | null;
	error: ApiError | null;
};

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type MatchRow = Database["public"]["Tables"]["matches"]["Update"];

export type InvoiceMatchSummary = {
	id: string;
	amount_matched: number;
	match_type: string;
	status: string;
	confidence: number | null;
	transaction_id: string;
};

export type InvoiceListItem = InvoiceRow & {
	client: Pick<ClientRow, "id" | "name" | "email"> | null;
	matches: InvoiceMatchSummary[];
	paid_amount: number;
	remaining_amount: number;
	is_overdue: boolean;
	days_overdue: number | null;
};

export type InvoiceDetail = InvoiceRow & {
	client: Pick<ClientRow, "id" | "name" | "email" | "paypal_payer_id"> | null;
	matches: (MatchRow & {
		transaction?: {
			id: string;
			paypal_transaction_id: string | null;
			amount: number;
			transaction_date: string | null;
			payer_name: string | null;
		} | null;
	})[];
	paid_amount: number;
	remaining_amount: number;
	is_overdue: boolean;
	days_overdue: number | null;
};

export type InvoiceFilters = {
	search?: string; // invoice_number or client name
	status?: "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled" | "all";
	clientId?: string;
	source?: "paypal" | "simulator" | "all";
	overdueOnly?: boolean;
	page?: number;
	pageSize?: number;
};

export class InvoiceService extends BaseService {
	/**
	 * List invoices with calculated paid/remaining amounts
	 */
	async list(filters: InvoiceFilters = {}): Promise<
		ServiceResult<{
			rows: InvoiceListItem[];
			total: number;
		}>
	> {
		try {
			const {
				search,
				status = "all",
				clientId,
				source = "all",
				overdueOnly = false,
				page = 1,
				pageSize = 100,
			} = filters;

			const profileId = await this.getProfileId();

			let query = this.supabase
				.from(this.INVOICES_TABLE)
				.select(
					`
					*,
					client:clients ( id, name, email ),
					matches (
						id,
						amount_matched,
						match_type,
						status,
						confidence,
						transaction_id
					)
				`,
					{ count: "exact" },
				)
				.eq("profile_id", profileId)
				.order("due_date", { ascending: true, nullsFirst: false });

			// Search (invoice number)
			if (search && search.trim()) {
				const term = `%${search.trim()}%`;
				query = query.or(`invoice_number.ilike.${term},description.ilike.${term}`);
			}

			// Status filter
			if (status !== "all") {
				query = query.eq("status", status);
			}

			// Client filter
			if (clientId) {
				query = query.eq("client_id", clientId);
			}

			// Source filter
			if (source !== "all") {
				query = query.eq("source", source);
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

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			let rows: InvoiceListItem[] = (data || []).map((inv) => {
				const approvedMatches = (inv.matches || []).filter((m) => m.status === "approved");
				const paid_amount = approvedMatches.reduce(
					(sum, m) => sum + Number(m.amount_matched || 0),
					0,
				);
				const remaining_amount = Math.max(0, Number(inv.amount) - paid_amount);

				let is_overdue = false;
				let days_overdue: number | null = null;

				if (inv.due_date && ["sent", "partially_paid", "overdue"].includes(inv.status)) {
					const due = new Date(inv.due_date);
					due.setHours(0, 0, 0, 0);
					if (due < today) {
						is_overdue = true;
						days_overdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
					}
				}

				return {
					...inv,
					matches: inv.matches || [],
					paid_amount,
					remaining_amount,
					is_overdue,
					days_overdue,
				};
			});

			// Client-side search on client name (PostgREST can't easily search nested)
			if (search && search.trim()) {
				const term = search.trim().toLowerCase();
				rows = rows.filter(
					(r) =>
						r.invoice_number?.toLowerCase().includes(term) ||
						r.description?.toLowerCase().includes(term) ||
						r.client?.name?.toLowerCase().includes(term),
				);
			}

			// Overdue only filter
			if (overdueOnly) {
				rows = rows.filter((r) => r.is_overdue);
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
				error: new ApiError(err.message || "Failed to list invoices", 500),
			};
		}
	}

	/**
	 * Get a single invoice with full match + transaction details
	 */
	async getById(id: string): Promise<ServiceResult<InvoiceDetail>> {
		try {
			const profileId = await this.getProfileId();

			const { data: invoice, error } = await this.supabase
				.from(this.INVOICES_TABLE)
				.select(
					`
					*,
					client:clients ( id, name, email, paypal_payer_id ),
					matches (
						id,
						amount_matched,
						match_type,
						status,
						confidence,
						reasoning,
						created_by,
						created_at,
						transaction_id,
						transaction:transactions (
							id,
							paypal_transaction_id,
							amount,
							transaction_date,
							payer_name
						)
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

			const approvedMatches = (invoice.matches || []).filter((m) => m.status === "approved");
			const paid_amount = approvedMatches.reduce((sum, m) => sum + Number(m.amount_matched || 0), 0);
			const remaining_amount = Math.max(0, Number(invoice.amount) - paid_amount);

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			let is_overdue = false;
			let days_overdue: number | null = null;

			if (invoice.due_date && ["sent", "partially_paid", "overdue"].includes(invoice.status)) {
				const due = new Date(invoice.due_date);
				due.setHours(0, 0, 0, 0);
				if (due < today) {
					is_overdue = true;
					days_overdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
				}
			}

			const result: InvoiceDetail = {
				...invoice,
				matches: invoice.matches || [],
				paid_amount,
				remaining_amount,
				is_overdue,
				days_overdue,
			};

			return { data: result, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to get invoice", 500),
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
