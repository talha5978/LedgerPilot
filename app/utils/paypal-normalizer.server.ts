export interface NormalizedTransaction {
	paypal_transaction_id: string;
	amount: number;
	fee_amount: number;
	net_amount: number;
	currency: string;
	payer_email: string;
	payer_name?: string;
	status: string; // completed | pending | declined | refunded | reversed
	raw_paypal: any;
	source: "webhook" | "simulator" | "manual";
	transaction_date: string;
	type: "payment" | "refund" | "reversal" | "fee";
}

export interface NormalizedInvoice {
	paypal_invoice_id: string;
	invoice_number: string;
	client_email: string;
	client_name?: string;
	amount: number;
	currency: string;
	status: "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled";
	due_date: string | null;
	issue_date?: string | null;
	description?: string | null;
	raw_paypal: any;
	source: "webhook" | "simulator" | "manual";
}

export type NormalizeResult = {
	transaction?: NormalizedTransaction;
	invoice?: NormalizedInvoice;
	/** true = we intentionally ignore this event (still log webhook_events) */
	ignored?: boolean;
	ignoreReason?: string;
};

// --------------------------------------------------
// Status / source helpers (schema-aligned)
// --------------------------------------------------
export function mapInvoiceStatus(
	raw: string,
): "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled" {
	switch ((raw || "").toUpperCase()) {
		case "PAID":
		case "MARKED_AS_PAID":
		case "COMPLETED":
			return "paid";
		case "PARTIALLY_PAID":
		case "PARTIALLY PAID":
			return "partially_paid";
		case "OVERDUE":
			return "overdue";
		case "CANCELLED":
		case "CANCELED":
		case "VOIDED":
			return "cancelled";
		case "DRAFT":
			return "draft";
		case "SENT":
		case "SCHEDULED":
		case "UNPAID":
		case "PAYMENT_PENDING":
		default:
			return "sent";
	}
}

export function mapTransactionStatus(raw: string): string {
	switch ((raw || "").toUpperCase()) {
		case "COMPLETED":
		case "SUCCESS":
			return "completed";
		case "PENDING":
			return "pending";
		case "DENIED":
		case "DECLINED":
		case "FAILED":
			return "declined";
		case "REFUNDED":
			return "refunded";
		case "REVERSED":
			return "reversed";
		case "CREATED":
		case "APPROVED":
			return "pending";
		default:
			return (raw || "completed").toLowerCase();
	}
}

export function mapSource(source: string): "paypal" | "simulator" {
	return source === "simulator" ? "simulator" : "paypal";
}

// --------------------------------------------------
// Event classification
// --------------------------------------------------
const MONEY_COMPLETED = new Set(["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.SALE.COMPLETED"]);

const MONEY_PENDING = new Set(["PAYMENT.CAPTURE.PENDING", "PAYMENT.SALE.PENDING"]);

const MONEY_DECLINED = new Set(["PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.SALE.DENIED"]);

const MONEY_REFUND = new Set([
	"PAYMENT.CAPTURE.REFUNDED",
	"PAYMENT.CAPTURE.REVERSED",
	"PAYMENT.SALE.REFUNDED",
	"PAYMENT.SALE.REVERSED",
]);

const INVOICE_EVENTS = new Set([
	"INVOICING.INVOICE.CREATED",
	"INVOICING.INVOICE.UPDATED",
	"INVOICING.INVOICE.SCHEDULED",
	"INVOICING.INVOICE.PAID",
	"INVOICING.INVOICE.CANCELLED",
	"INVOICING.INVOICE.REFUNDED",
	// older / alternate prefixes some sandboxes still send
	"INVOICE.CREATED",
	"INVOICE.UPDATED",
	"INVOICE.PAID",
	"INVOICE.CANCELLED",
	"INVOICE.REFUNDED",
]);

/** Events we must NOT treat as money received */
const IGNORE_AS_PAYMENT = new Set([
	"PAYMENTS.PAYMENT.CREATED", // checkout created/approved — not captured
	"CHECKOUT.ORDER.APPROVED",
	"CHECKOUT.ORDER.COMPLETED", // platform/marketplace oriented; capture events are the real money signal
	"CHECKOUT.PAYMENT-APPROVAL.REVERSED",
	"PAYMENT.AUTHORIZATION.CREATED",
	"PAYMENT.AUTHORIZATION.VOIDED",
	"PAYMENT.REFUND.PENDING",
	"PAYMENT.REFUND.FAILED",
]);

// --------------------------------------------------
// Parsers
// --------------------------------------------------
function parseMoneyFromCaptureOrSale(resource: any): {
	id: string;
	amount: number;
	fee_amount: number;
	net_amount: number;
	currency: string;
	payer_email: string;
	payer_name?: string;
	statusRaw: string;
	date: string;
} {
	// Modern Capture shape
	const breakdown = resource.seller_receivable_breakdown;
	const amountObj = resource.amount || breakdown?.gross_amount || resource.transactions?.[0]?.amount || {};

	const feeObj = breakdown?.paypal_fee ||
		resource.transaction_fee ||
		resource.transactions?.[0]?.related_resources?.[0]?.sale?.transaction_fee || { value: "0" };

	const netObj = breakdown?.net_amount;

	const amount = parseFloat(String(amountObj.value ?? amountObj.total ?? "0"));
	const fee_amount = parseFloat(String(feeObj.value ?? "0"));
	const net_amount = netObj
		? parseFloat(String(netObj.value ?? "0"))
		: Number((amount - fee_amount).toFixed(2));

	const currency = amountObj.currency_code || amountObj.currency || "USD";

	const payerEmail =
		resource.payer?.email_address ||
		resource.payer?.payer_info?.email ||
		resource.payer_info?.email ||
		resource.payee?.email || // rarely
		"unknown@client.com";

	const nameObj = resource.payer?.name || resource.payer?.payer_info || resource.payer_info;

	const payer_name = nameObj
		? `${nameObj.given_name || nameObj.first_name || ""} ${nameObj.surname || nameObj.last_name || ""}`.trim() ||
			undefined
		: undefined;

	return {
		id: resource.id || `TXN-${Date.now()}`,
		amount,
		fee_amount,
		net_amount,
		currency,
		payer_email: payerEmail,
		payer_name,
		statusRaw: resource.status || resource.state || "COMPLETED",
		date: resource.create_time || resource.update_time || new Date().toISOString(),
	};
}

function parseInvoice(resource: any): NormalizedInvoice {
	const totalObj = resource.detail?.amount ||
		resource.amount ||
		resource.due_amount || { value: "0", currency_code: "USD" };

	const amount = parseFloat(String(totalObj.value ?? totalObj.total ?? "0"));
	const currency = totalObj.currency_code || totalObj.currency || "USD";

	const client_email =
		resource.primary_recipients?.[0]?.billing_info?.email_address ||
		resource.primary_recipients?.[0]?.email_address ||
		resource.billing_info?.email_address ||
		"unknown@client.com";

	const client_name =
		resource.primary_recipients?.[0]?.billing_info?.name?.full_name ||
		resource.primary_recipients?.[0]?.billing_info?.business_name ||
		undefined;

	const rawStatus = resource.status || resource.detail?.status || "SENT";

	return {
		paypal_invoice_id: resource.id || `INV-${Date.now()}`,
		invoice_number:
			resource.detail?.invoice_number ||
			resource.invoice_number ||
			resource.number ||
			`INV-${Date.now()}`,
		client_email,
		client_name,
		amount,
		currency,
		status: mapInvoiceStatus(rawStatus),
		due_date: resource.detail?.payment_term?.due_date || resource.due_date || null,
		issue_date: resource.detail?.invoice_date || resource.invoice_date || null,
		description: resource.detail?.note || resource.note || null,
		raw_paypal: resource,
		source: "webhook",
	};
}

// --------------------------------------------------
// Main entry
// --------------------------------------------------
export function normalizePayPalEvent(
	eventType: string,
	payload: any,
	source: "webhook" | "simulator" | "manual" = "webhook",
): NormalizeResult {
	const type = (eventType || "").toUpperCase();
	const resource = payload?.resource ?? payload;

	// Explicitly ignore non-money checkout/auth events
	if (IGNORE_AS_PAYMENT.has(type)) {
		return {
			ignored: true,
			ignoreReason: `${type} is not a funds-received event. Wait for PAYMENT.CAPTURE.COMPLETED or PAYMENT.SALE.COMPLETED.`,
		};
	}

	// ----- Money in (completed) -----
	if (MONEY_COMPLETED.has(type)) {
		const m = parseMoneyFromCaptureOrSale(resource);
		return {
			transaction: {
				paypal_transaction_id: m.id,
				amount: m.amount,
				fee_amount: m.fee_amount,
				net_amount: m.net_amount,
				currency: m.currency,
				payer_email: m.payer_email,
				payer_name: m.payer_name,
				status: "completed",
				raw_paypal: payload,
				source,
				transaction_date: m.date,
				type: "payment",
			},
		};
	}

	// ----- Money pending -----
	if (MONEY_PENDING.has(type)) {
		const m = parseMoneyFromCaptureOrSale(resource);
		return {
			transaction: {
				paypal_transaction_id: m.id,
				amount: m.amount,
				fee_amount: m.fee_amount,
				net_amount: m.net_amount,
				currency: m.currency,
				payer_email: m.payer_email,
				payer_name: m.payer_name,
				status: "pending",
				raw_paypal: payload,
				source,
				transaction_date: m.date,
				type: "payment",
			},
		};
	}

	// ----- Declined -----
	if (MONEY_DECLINED.has(type)) {
		const m = parseMoneyFromCaptureOrSale(resource);
		return {
			transaction: {
				paypal_transaction_id: m.id,
				amount: m.amount,
				fee_amount: m.fee_amount,
				net_amount: m.net_amount,
				currency: m.currency,
				payer_email: m.payer_email,
				payer_name: m.payer_name,
				status: "declined",
				raw_paypal: payload,
				source,
				transaction_date: m.date,
				type: "payment",
			},
		};
	}

	// ----- Refunds / reversals -----
	if (MONEY_REFUND.has(type)) {
		const m = parseMoneyFromCaptureOrSale(resource);
		const isReversal = type.includes("REVERSED");
		return {
			transaction: {
				paypal_transaction_id: m.id,
				amount: Math.abs(m.amount),
				fee_amount: m.fee_amount,
				net_amount: Math.abs(m.net_amount),
				currency: m.currency,
				payer_email: m.payer_email,
				payer_name: m.payer_name,
				status: isReversal ? "reversed" : "refunded",
				raw_paypal: payload,
				source,
				transaction_date: m.date,
				type: isReversal ? "reversal" : "refund",
			},
		};
	}

	// ----- Invoices -----
	if (INVOICE_EVENTS.has(type) || type.startsWith("INVOICING.") || type.startsWith("INVOICE.")) {
		const inv = parseInvoice(resource);
		inv.raw_paypal = payload;
		inv.source = source;

		// PAID event may mean full or partial — status from resource is authoritative via mapInvoiceStatus
		if (type.includes("PAID")) {
			const raw = (resource.status || "").toUpperCase();
			if (raw.includes("PARTIAL")) inv.status = "partially_paid";
			else inv.status = "paid";
		}
		if (type.includes("CANCELLED") || type.includes("CANCELED")) {
			inv.status = "cancelled";
		}

		return { invoice: inv };
	}

	// Unknown event — log only, do not invent a transaction
	return {
		ignored: true,
		ignoreReason: `Unhandled event type: ${type}`,
	};
}

export function mapPayPalStatus(
	rawStatus: string,
): "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled" {
	switch (rawStatus?.toUpperCase()) {
		case "PAID":
		case "COMPLETED":
			return "paid";
		case "SENT":
		case "CREATED":
		case "APPROVED":
			return "sent";
		case "PARTIALLY_PAID":
			return "partially_paid";
		case "OVERDUE":
			return "overdue";
		case "CANCELLED":
		case "VOIDED":
			return "cancelled";
		default:
			return "sent";
	}
}
