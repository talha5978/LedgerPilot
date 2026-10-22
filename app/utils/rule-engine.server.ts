export interface OpenInvoice {
	id: string;
	invoice_number: string;
	amount: number;
	currency: string;
	client_email: string;
}

export interface IncomingTransaction {
	id: string;
	amount: number;
	net: number;
	fee: number;
	currency: string;
	payer_email: string;
}

export interface RuleResult {
	transaction_id: string;
	invoice_id: string;
	match_type: "exact" | "fee_adjusted" | "none";
	confidence: number;
	reasoning: string;
}

export function runRuleEngine(transaction: IncomingTransaction, openInvoices: OpenInvoice[]): RuleResult {
	const payerEmailClean = transaction.payer_email.toLowerCase().trim();

	// 1. Exact Match
	const exactMatch = openInvoices.find(
		(inv) =>
			inv.currency === transaction.currency &&
			inv.amount === transaction.amount &&
			inv.client_email.toLowerCase().trim() === payerEmailClean,
	);

	if (exactMatch) {
		return {
			transaction_id: transaction.id,
			invoice_id: exactMatch.id,
			match_type: "exact",
			confidence: 1.0,
			reasoning: `Exact match: Amount ($${transaction.amount}) and payer email match invoice #${exactMatch.invoice_number}.`,
		};
	}

	// 2. Fee-Adjusted Match
	const feeAdjustedMatch = openInvoices.find(
		(inv) =>
			inv.currency === transaction.currency &&
			Math.abs(inv.amount - transaction.net) < 0.01 &&
			inv.client_email.toLowerCase().trim() === payerEmailClean,
	);

	if (feeAdjustedMatch) {
		return {
			transaction_id: transaction.id,
			invoice_id: feeAdjustedMatch.id,
			match_type: "fee_adjusted",
			confidence: 0.95,
			reasoning: `Fee-adjusted match: Net amount after PayPal fee ($${transaction.net}) matches invoice #${feeAdjustedMatch.invoice_number}.`,
		};
	}

	return {
		transaction_id: transaction.id,
		invoice_id: "",
		match_type: "none",
		confidence: 0.0,
		reasoning: "No deterministic rule match found. Escalating to agent runner.",
	};
}

export function checkOverdueInvoices(
	openInvoices: { id: string; due_date: string | null }[],
): { invoiceId: string; daysOverdue: number }[] {
	const now = new Date().getTime();
	const results = [];

	for (const inv of openInvoices) {
		if (!inv.due_date) continue;
		const dueDate = new Date(inv.due_date).getTime();
		if (now > dueDate) {
			const diffDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
			results.push({ invoiceId: inv.id, daysOverdue: diffDays });
		}
	}

	return results;
}
