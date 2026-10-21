import { ApiError } from "~/utils/errors/ApiError";

type PayPalResult<T> = {
	data: T | null;
	error: ApiError | null;
};

export class PayPalService {
	private readonly baseUrl = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
	private readonly clientId = process.env.PAYPAL_CLIENT_ID!;
	private readonly clientSecret = process.env.PAYPAL_CLIENT_SECRET!;

	// --------------------------------------------------
	// Internal: Get OAuth Access Token
	// --------------------------------------------------
	private async getAccessToken(): Promise<PayPalResult<string>> {
		try {
			const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

			const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
				method: "POST",
				headers: {
					Authorization: `Basic ${credentials}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: "grant_type=client_credentials",
			});

			const json = await response.json();

			if (!response.ok) {
				return {
					data: null,
					error: new ApiError(
						json.error_description || json.error || "Failed to get PayPal access token",
						response.status,
						[json],
					),
				};
			}

			return { data: json.access_token as string, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "PayPal token request failed", 500),
			};
		}
	}

	// --------------------------------------------------
	// Internal: Authenticated request helper
	// --------------------------------------------------
	private async Request<T>(method: string, path: string, body?: unknown): Promise<PayPalResult<T>> {
		const tokenResult = await this.getAccessToken();
		if (tokenResult.error || !tokenResult.data) {
			return { data: null, error: tokenResult.error };
		}

		try {
			const response = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${tokenResult.data}`,
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: body ? JSON.stringify(body) : undefined,
			});

			const json = await response.json().catch(() => ({}));

			if (!response.ok) {
				return {
					data: null,
					error: new ApiError(
						json.message || json.error_description || json.name || "PayPal API error",
						response.status,
						[json],
					),
				};
			}

			return { data: json as T, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "PayPal request failed", 500),
			};
		}
	}

	// --------------------------------------------------
	// 1. Search Transactions (Transaction Search API)
	// --------------------------------------------------
	async searchTransactions(params: {
		startDate: string; // ISO date e.g. 2026-09-01T00:00:00Z
		endDate: string;
		pageSize?: number;
		page?: number;
	}): Promise<PayPalResult<any>> {
		const searchParams = new URLSearchParams({
			start_date: params.startDate,
			end_date: params.endDate,
			page_size: String(params.pageSize ?? 100),
			page: String(params.page ?? 1),
			fields: "all",
		});

		return this.Request("GET", `/v1/reporting/transactions?${searchParams.toString()}`);
	}

	// --------------------------------------------------
	// 2. List / Search Invoices
	// --------------------------------------------------
	async searchInvoices(
		body: {
			page?: number;
			page_size?: number;
			status?: string[];
			invoice_number?: string;
			recipient_email?: string;
			total_amount_range?: {
				lower_amount?: { currency_code: string; value: string };
				upper_amount?: { currency_code: string; value: string };
			};
		} = {},
	): Promise<PayPalResult<any>> {
		const payload = {
			page: body.page ?? 1,
			page_size: body.page_size ?? 100,
			total_count_required: true,
			...body,
		};

		return this.Request("POST", "/v2/invoicing/search-invoices", payload);
	}

	// --------------------------------------------------
	// 3. Get a single Invoice
	// --------------------------------------------------
	async getInvoice(invoiceId: string): Promise<PayPalResult<any>> {
		if (!invoiceId) {
			return {
				data: null,
				error: new ApiError("Invoice ID is required", 400),
			};
		}

		return this.Request("GET", `/v2/invoicing/invoices/${invoiceId}`);
	}

	// --------------------------------------------------
	// 4. Send Invoice Reminder
	// --------------------------------------------------
	async sendInvoiceReminder(
		invoiceId: string,
		options?: {
			subject?: string;
			note?: string;
			send_to_invoicer?: boolean;
			send_to_recipient?: boolean;
		},
	): Promise<PayPalResult<any>> {
		if (!invoiceId) {
			return {
				data: null,
				error: new ApiError("Invoice ID is required", 400),
			};
		}

		const body = {
			subject: options?.subject ?? "Reminder: Your invoice is due",
			note: options?.note ?? "This is a friendly reminder that payment is due.",
			send_to_invoicer: options?.send_to_invoicer ?? false,
			send_to_recipient: options?.send_to_recipient ?? true,
		};

		return this.Request("POST", `/v2/invoicing/invoices/${invoiceId}/remind`, body);
	}

	// --------------------------------------------------
	// 5. Create Invoice (optional – useful for demo seeding)
	// --------------------------------------------------
	async createInvoice(invoicePayload: Record<string, any>): Promise<PayPalResult<any>> {
		return this.Request("POST", "/v2/invoicing/invoices", invoicePayload);
	}

	// --------------------------------------------------
	// 6. Refund a Capture (for duplicate / anomaly cases)
	// --------------------------------------------------
	async refundCapture(
		captureId: string,
		options?: {
			amount?: { currency_code: string; value: string };
			note_to_payer?: string;
		},
	): Promise<PayPalResult<any>> {
		if (!captureId) {
			return {
				data: null,
				error: new ApiError("Capture ID is required", 400),
			};
		}

		const body: any = {};
		if (options?.amount) {
			body.amount = options.amount;
		}
		if (options?.note_to_payer) {
			body.note_to_payer = options.note_to_payer;
		}

		return this.Request(
			"POST",
			`/v2/payments/captures/${captureId}/refund`,
			Object.keys(body).length > 0 ? body : undefined,
		);
	}

	// --------------------------------------------------
	// 7. Get Capture Details (helper)
	// --------------------------------------------------
	async getCapture(captureId: string): Promise<PayPalResult<any>> {
		if (!captureId) {
			return {
				data: null,
				error: new ApiError("Capture ID is required", 400),
			};
		}

		return this.Request("GET", `/v2/payments/captures/${captureId}`);
	}
}
