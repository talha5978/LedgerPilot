import { useMemo } from "react";
import { AgCharts } from "ag-charts-react";
import type { AgChartOptions } from "ag-charts-community";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { PieChart } from "lucide-react";

interface InvoiceStatusChartProps {
	invoices: Array<{ status: string; amount?: number }>;
}

export function InvoiceStatusChart({ invoices }: InvoiceStatusChartProps) {
	// Aggregate all invoice statuses dynamically
	const chartData = useMemo(() => {
		const statusCounts = invoices.reduce((acc: Record<string, number>, inv) => {
			const rawStatus = (inv.status || "sent").toLowerCase();
			// Format status string (e.g., partially_paid -> Partially Paid)
			const formattedStatus = rawStatus.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());

			acc[formattedStatus] = (acc[formattedStatus] || 0) + 1;
			return acc;
		}, {});

		return Object.keys(statusCounts).map((status) => ({
			status,
			count: statusCounts[status],
		}));
	}, [invoices]);

	const options: AgChartOptions = {
		data: chartData,
		background: {
			fill: "transparent",
		},
		series: [
			{
				type: "donut",
				angleKey: "count",
				legendItemKey: "status",
				innerRadiusRatio: 0.65,
				strokeWidth: 2,
				calloutLabelKey: "status",
				sectorLabelKey: "count",
				sectorLabel: {
					formatter: ({ value }) => `${value}`,
					color: "currentColor",
					fontWeight: "bold",
				},
			},
		],
		legend: {
			position: "bottom",
			item: {
				label: {
					color: "currentColor",
				},
			},
		},
	};

	return (
		<Card className="border-border/60 bg-card overflow-hidden shadow-sm">
			<CardHeader className="pb-2 pt-5 px-6 border-b border-border/40">
				<CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
					<PieChart className="w-4 h-4 text-primary" /> Open Invoices Distribution
				</CardTitle>
			</CardHeader>
			<CardContent className="p-6">
				{chartData.length === 0 ? (
					<div className="h-65 flex items-center justify-center text-sm text-muted-foreground">
						No invoice metrics available yet.
					</div>
				) : (
					<div className="h-65 w-full">
						<AgCharts options={options} />
					</div>
				)}
			</CardContent>
		</Card>
	);
}
