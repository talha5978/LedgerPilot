import { BaseService } from "~/services/base.server.service";
import type { Database } from "~/types/database";
import type { ServiceResult } from "~/types/service-result";
import { ApiError } from "~/utils/errors/ApiError";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

export type ClientWithStats = ClientRow & {
	total_invoices: number;
	total_billed: number;
	total_paid: number;
	outstanding_balance: number;
	invoices?: Array<{
		id: string;
		invoice_number: string | null;
		amount: number;
		currency: string;
		status: string;
		due_date: string;
	}>;
};

export class ClientsService extends BaseService {
	/**
	 * List all clients with aggregated financial statistics
	 */
	async listClients(): Promise<ServiceResult<ClientWithStats[]>> {
		try {
			const profileId = await this.resolveProfileId();

			const { data: clients, error } = await this.supabase
				.from(this.CLIENTS_TABLE)
				.select(
					`
                    *,
                    invoices:invoices (
                        id,
                        invoice_number,
                        amount,
                        currency,
                        status,
                        due_date
                    )
                    `,
				)
				.eq("profile_id", profileId)
				.order("created_at", { ascending: false });

			if (error) {
				return { data: null, error: new ApiError(error.message, 500, [error]) };
			}

			// Compute financial statistics for each client
			const formattedClients: ClientWithStats[] = (clients || []).map((client: any) => {
				const invoices = client.invoices || [];
				const total_invoices = invoices.length;

				let total_billed = 0;
				let total_paid = 0;
				let outstanding_balance = 0;

				invoices.forEach((inv: any) => {
					const amt = Number(inv.amount) || 0;
					total_billed += amt;

					if (inv.status === "paid") {
						total_paid += amt;
					} else if (
						inv.status === "sent" ||
						inv.status === "overdue" ||
						inv.status === "partially_paid"
					) {
						outstanding_balance += amt;
					}
				});

				return {
					...client,
					total_invoices,
					total_billed,
					total_paid,
					outstanding_balance,
					invoices,
				};
			});

			return { data: formattedClients, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to fetch clients", 500),
			};
		}
	}

	private async resolveProfileId(): Promise<string> {
		try {
			const {
				data: { user },
			} = await this.supabase.auth.getUser();
			if (user?.id) return user.id;
		} catch {
			// Unauthenticated fallback
		}

		const { data: profile } = await this.supabase
			.from(this.PROFILES_TABLE)
			.select("id")
			.limit(1)
			.maybeSingle();

		if (profile?.id) return profile.id;

		return "00000000-0000-0000-0000-000000000001";
	}
}
