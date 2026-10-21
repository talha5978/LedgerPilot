import { useLoaderData, useSearchParams, useNavigation } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useMemo, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams, ICellRendererParams } from "ag-grid-community";
import { format } from "date-fns";

import { TransactionService } from "~/services/transactions.service.server";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

// --------------------------------------------------
// Loader
// --------------------------------------------------
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);

	const filters = {
		search: url.searchParams.get("search") || undefined,
		matchStatus: (url.searchParams.get("matchStatus") as any) || "all",
		hasAnomaly:
			url.searchParams.get("hasAnomaly") === "true"
				? true
				: url.searchParams.get("hasAnomaly") === "false"
					? false
					: undefined,
		source: (url.searchParams.get("source") as any) || "all",
		page: Number(url.searchParams.get("page") || 1),
		pageSize: Number(url.searchParams.get("pageSize") || 100),
	};

	const service = new TransactionService(request);
	const { data, error } = await service.list(filters);

	if (error) {
		throw new Response(error.message, { status: error.statusCode });
	}

	return {
		rows: data?.rows ?? [],
		total: data?.total ?? 0,
		filters,
	};
}

// --------------------------------------------------
// Cell Renderers
// --------------------------------------------------
function MatchStatusRenderer(props: ICellRendererParams) {
	const matches = props.data?.matches || [];
	const hasApproved = matches.some((m: any) => m.status === "approved");
	const hasProposed = matches.some((m: any) => m.status === "proposed");

	if (hasApproved) {
		return (
			<Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
				Matched
			</Badge>
		);
	}
	if (hasProposed) {
		return (
			<Badge
				variant="secondary"
				className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
			>
				Proposed
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-muted-foreground">
			Unmatched
		</Badge>
	);
}

function AnomalyRenderer(props: ICellRendererParams) {
	const anomalies = (props.data?.annotations || []).filter((a: any) => a.anomaly_type);
	if (anomalies.length === 0) return <span className="text-muted-foreground">—</span>;

	return (
		<div className="flex gap-1 items-center h-full">
			{anomalies.map((a: any) => (
				<Badge key={a.id} variant="destructive" className="text-[10px] px-1.5 py-0.5">
					{a.anomaly_type.split("_").join(" ").toUpperCase()}
				</Badge>
			))}
		</div>
	);
}

function CategoryRenderer(props: ICellRendererParams) {
	const category = (props.data?.annotations || []).find((a: any) => a.category)?.category;
	return category ? (
		<span className="font-medium text-xs px-2 py-1 rounded-md bg-muted/60 text-foreground">
			{category}
		</span>
	) : (
		<span className="text-muted-foreground">—</span>
	);
}

function MoneyRenderer(props: ICellRendererParams) {
	const value = props.value;
	if (value == null) return "—";
	const num = Number(value);
	const isNegative = num < 0;

	return (
		<span
			className={`font-mono tabular-nums font-medium ${isNegative ? "text-rose-600 dark:text-rose-400" : ""}`}
		>
			{num.toLocaleString("en-US", {
				style: "currency",
				currency: props.data?.currency || "USD",
			})}
		</span>
	);
}

// --------------------------------------------------
// Page Component
// --------------------------------------------------
export default function TransactionsPage() {
	const { rows, total, filters } = useLoaderData<typeof loader>();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigation = useNavigation();
	const isLoading = navigation.state === "loading";

	const updateFilter = useCallback(
		(key: string, value: string | null) => {
			const next = new URLSearchParams(searchParams);
			if (value && value !== "all" && value !== "") {
				next.set(key, value);
			} else {
				next.delete(key);
			}
			next.delete("page");
			setSearchParams(next);
		},
		[searchParams, setSearchParams],
	);

	const columnDefs = useMemo<ColDef[]>(
		() => [
			{
				headerName: "Date",
				field: "transaction_date",
				flex: 1.2,
				minWidth: 140,
				valueFormatter: (p: ValueFormatterParams) =>
					p.value ? format(new Date(p.value), "dd MMM yy HH:mm") : "—",
			},
			{
				headerName: "Amount",
				field: "amount",
				flex: 1,
				minWidth: 100,
				cellRenderer: MoneyRenderer,
				type: "rightAligned",
			},
			{
				headerName: "Fee",
				field: "fee_amount",
				flex: 0.8,
				minWidth: 90,
				cellRenderer: MoneyRenderer,
				type: "rightAligned",
			},
			{
				headerName: "Net",
				field: "net_amount",
				flex: 1,
				minWidth: 100,
				cellRenderer: MoneyRenderer,
				type: "rightAligned",
			},
			{
				headerName: "Payer",
				field: "payer_name",
				flex: 1.5,
				minWidth: 150,
				valueGetter: (p) => p.data?.payer_name || p.data?.payer_email || "—",
			},
			{
				headerName: "Client",
				field: "client.name",
				flex: 1.2,
				minWidth: 120,
				valueGetter: (p) => p.data?.client?.name || "—",
			},
			{
				headerName: "Match",
				flex: 1,
				minWidth: 110,
				cellRenderer: MatchStatusRenderer,
			},
			{
				headerName: "Category",
				flex: 1.1,
				minWidth: 120,
				cellRenderer: CategoryRenderer,
			},
			{
				headerName: "Anomaly",
				flex: 1.2,
				minWidth: 130,
				cellRenderer: AnomalyRenderer,
			},
			{
				headerName: "Conf.", // shortened header text to save space
				flex: 0.8,
				minWidth: 90,
				valueGetter: (p) => {
					const match = (p.data?.matches || [])[0];
					return match?.confidence != null ? `${Math.round(match.confidence * 100)}%` : "—";
				},
			},
			{
				headerName: "Source",
				field: "source",
				flex: 0.9,
				minWidth: 95,
				cellRenderer: (p: ICellRendererParams) => (
					<Badge
						variant={p.value === "simulator" ? "secondary" : "outline"}
						className="capitalize text-[10px]"
					>
						{p.value}
					</Badge>
				),
			},
		],
		[],
	);

	const defaultColDef = useMemo<ColDef>(
		() => ({
			sortable: true,
			filter: true,
			resizable: true,
			suppressHeaderMenuButton: true,
			cellClass: "flex items-center text-sm",
		}),
		[],
	);

	return (
		<div className="flex flex-col h-[calc(100vh-5rem)] gap-4 p-6">
			{/* Header + Filters */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="md:text-3xl text-2xl font-bold mb-1 tracking-tight">Transactions</h1>
					<p className="text-sm text-muted-foreground">
						Manage and review transaction flows •{" "}
						<span className="font-semibold text-foreground">{total}</span> total
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Input
						placeholder="Search payer or ID…"
						className="w-60 h-9 bg-background shadow-sm"
						defaultValue={filters.search || ""}
						onChange={(e) => {
							updateFilter("search", e.target.value || null);
						}}
					/>

					<Select
						value={filters.matchStatus || "all"}
						onValueChange={(v) => updateFilter("matchStatus", v)}
					>
						<SelectTrigger className="w-36 h-9 bg-background shadow-sm">
							<SelectValue placeholder="Match status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All matches</SelectItem>
							<SelectItem value="matched">Matched</SelectItem>
							<SelectItem value="proposed">Proposed</SelectItem>
							<SelectItem value="unmatched">Unmatched</SelectItem>
						</SelectContent>
					</Select>

					<Select
						value={
							filters.hasAnomaly === true
								? "true"
								: filters.hasAnomaly === false
									? "false"
									: "all"
						}
						onValueChange={(v) => updateFilter("hasAnomaly", v === "all" ? null : v)}
					>
						<SelectTrigger className="w-32 h-9 bg-background shadow-sm">
							<SelectValue placeholder="Anomalies" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All</SelectItem>
							<SelectItem value="true">Has anomaly</SelectItem>
							<SelectItem value="false">No anomaly</SelectItem>
						</SelectContent>
					</Select>

					<Select value={filters.source || "all"} onValueChange={(v) => updateFilter("source", v)}>
						<SelectTrigger className="w-32 h-9 bg-background shadow-sm">
							<SelectValue placeholder="Source" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All sources</SelectItem>
							<SelectItem value="paypal">PayPal</SelectItem>
							<SelectItem value="simulator">Simulator</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* AG Grid Container with Modern Theme Overrides */}
			<div className="flex-1 ag-theme-quartz rounded-lg border shadow-sm overflow-hidden bg-card">
				<AgGridReact
					rowData={rows}
					columnDefs={columnDefs}
					defaultColDef={defaultColDef}
					rowHeight={48}
					headerHeight={44}
					animateRows={true}
					suppressCellFocus={true}
					rowSelection="multiple"
					getRowId={(params) => params.data.id}
					overlayLoadingTemplate={
						isLoading
							? '<span class="ag-overlay-loading-center text-muted-foreground">Loading…</span>'
							: undefined
					}
					onGridReady={(params) => {
						params.api.sizeColumnsToFit();
						// Optional: Re-fit if the window resizes
						window.addEventListener("resize", () => params.api.sizeColumnsToFit());
					}}
					overlayNoRowsTemplate='<span class="text-muted-foreground font-medium">No transactions found</span>'
				/>
			</div>
		</div>
	);
}
