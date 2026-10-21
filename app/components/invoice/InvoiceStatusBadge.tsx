import { Badge } from "~/components/ui/badge";

const statusMap: Record<string, { label: string; className: string }> = {
	paid: { label: "Paid", className: "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" },
	partially_paid: {
		label: "Partial",
		className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-transparent",
	},
	overdue: { label: "Overdue", className: "bg-rose-600 hover:bg-rose-700 text-white border-transparent" },
	sent: {
		label: "Sent",
		className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-transparent",
	},
	draft: { label: "Draft", className: "text-muted-foreground" },
	cancelled: { label: "Cancelled", className: "text-muted-foreground line-through" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
	const config = statusMap[status] || { label: status, className: "" };
	return (
		<Badge variant="outline" className={`capitalize text-[11px] ${config.className}`}>
			{" "}
			{config.label}{" "}
		</Badge>
	);
}
