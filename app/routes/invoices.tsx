import { useLoaderData, useSearchParams, useNavigation, useFetcher } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useMemo, useCallback, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { format } from "date-fns";

import { InvoiceService } from "~/services/invoices.service.server";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Progress } from "~/components/ui/progress";
import { InvoiceStatusBadge } from "~/components/invoice/InvoiceStatusBadge";

export const meta = () => {
	return [{ title: "Invoices | LedgerPilot" }];
};

// --------------------------------------------------
// Loader
// --------------------------------------------------
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);

	const filters = {
		search: url.searchParams.get("search") || undefined,
		status: (url.searchParams.get("status") as any) || "all",
		source: (url.searchParams.get("source") as any) || "all",
		overdueOnly: url.searchParams.get("overdueOnly") === "true",
		page: Number(url.searchParams.get("page") || 1),
		pageSize: Number(url.searchParams.get("pageSize") || 100),
	};

	const service = new InvoiceService(request);
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
function MoneyRenderer(props: ICellRendererParams) {
	const value = props.value;
	if (value == null) return <span className="text-muted-foreground">—</span>;
	return (
		<span className="font-mono tabular-nums font-medium">
			{Number(value).toLocaleString("en-US", {
				style: "currency",
				currency: props.data?.currency || "USD",
			})}
		</span>
	);
}

function StatusRenderer(props: ICellRendererParams) {
	return <InvoiceStatusBadge status={props.value} />;
}

function DueDateRenderer(props: ICellRendererParams) {
	const { due_date, is_overdue, days_overdue, status } = props.data || {};
	if (!due_date) return <span className="text-muted-foreground">—</span>;

	const formatted = format(new Date(due_date), "dd MMM yyyy");

	if (is_overdue && status !== "paid") {
		return (
			<div className="flex flex-col">
				<span className="text-rose-600 dark:text-rose-400 font-medium animate-pulse">
					{formatted}
				</span>
				<span className="text-[10px] text-rose-500 animate-pulse">{days_overdue}d overdue</span>
			</div>
		);
	}

	return <span>{formatted}</span>;
}

function PaidProgressRenderer(props: ICellRendererParams) {
	const amount = Number(props.data?.amount || 0);
	const paid = Number(props.data?.paid_amount);
	const percent = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;

	return (
		<div className="flex items-center gap-2 w-full pr-2">
			<div className="flex-1">
				<Progress value={percent} className="h-1.5" />
			</div>
			<span className="text-[11px] text-muted-foreground w-8 text-right">{percent}%</span>
		</div>
	);
}

// --------------------------------------------------
// Page
// --------------------------------------------------
export default function InvoicesPage() {
	const { rows, total, filters } = useLoaderData<typeof loader>();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigation = useNavigation();
	const isLoading = navigation.state === "loading";

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const detailFetcher = useFetcher();

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

	const onRowClicked = useCallback(
		(event: any) => {
			const id = event.data?.id;
			if (!id) return;

			setSelectedId(id);
			detailFetcher.load(`/invoices/${id}`);
		},
		[detailFetcher],
	);

	const columnDefs = useMemo<ColDef[]>(
		() => [
			{
				headerName: "Invoice",
				field: "invoice_number",
				flex: 1.1,
				minWidth: 120,
				cellRenderer: (p: ICellRendererParams) => (
					<span className="font-medium">{p.value || "—"}</span>
				),
			},
			{
				headerName: "Client",
				flex: 1.3,
				minWidth: 140,
				valueGetter: (p) => p.data?.client?.name || "—",
			},
			{
				headerName: "Amount",
				field: "amount",
				flex: 1,
				minWidth: 110,
				cellRenderer: MoneyRenderer,
				type: "rightAligned",
			},
			{
				headerName: "Paid",
				field: "paid_amount",
				flex: 1,
				minWidth: 100,
				cellRenderer: MoneyRenderer,
				type: "rightAligned",
			},
			{
				headerName: "Remaining",
				field: "remaining_amount",
				flex: 1,
				minWidth: 110,
				cellRenderer: MoneyRenderer,
				type: "rightAligned",
			},
			{
				headerName: "Progress",
				flex: 1.2,
				minWidth: 130,
				cellRenderer: PaidProgressRenderer,
				sortable: false,
				filter: false,
			},
			{
				headerName: "Status",
				field: "status",
				flex: 0.9,
				minWidth: 100,
				cellRenderer: StatusRenderer,
			},
			{
				headerName: "Due Date",
				field: "due_date",
				flex: 1.2,
				minWidth: 130,
				cellRenderer: DueDateRenderer,
			},
			{
				headerName: "Source",
				field: "source",
				flex: 0.8,
				minWidth: 90,
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

	const detail = detailFetcher.data;

	return (
		<div className="flex flex-col h-[calc(100vh-5rem)] gap-4 p-6">
			{/* Header + Filters */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="md:text-3xl text-2xl font-bold mb-1 tracking-tight">Invoices</h1>
					<p className="text-sm text-muted-foreground">
						Track payments and overdue invoices •{" "}
						<span className="font-semibold text-foreground">{total}</span> total
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Input
						placeholder="Search invoice or client…"
						className="w-60 h-9 bg-background shadow-sm"
						defaultValue={filters.search || ""}
						onChange={(e) => updateFilter("search", e.target.value || null)}
					/>

					<Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v)}>
						<SelectTrigger className="w-36 h-9 bg-background shadow-sm">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All statuses</SelectItem>
							<SelectItem value="paid">Paid</SelectItem>
							<SelectItem value="partially_paid">Partially paid</SelectItem>
							<SelectItem value="overdue">Overdue</SelectItem>
							<SelectItem value="sent">Sent</SelectItem>
							<SelectItem value="draft">Draft</SelectItem>
							<SelectItem value="cancelled">Cancelled</SelectItem>
						</SelectContent>
					</Select>

					<Select
						value={filters.overdueOnly ? "true" : "all"}
						onValueChange={(v) => updateFilter("overdueOnly", v === "true" ? "true" : null)}
					>
						<SelectTrigger className="w-36 h-9 bg-background shadow-sm">
							<SelectValue placeholder="Overdue" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All invoices</SelectItem>
							<SelectItem value="true">Overdue only</SelectItem>
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

			{/* Grid */}
			<div className="flex-1 ag-theme-quartz rounded-lg border shadow-sm overflow-hidden bg-card">
				<AgGridReact
					rowData={rows}
					columnDefs={columnDefs}
					defaultColDef={defaultColDef}
					rowHeight={48}
					headerHeight={44}
					animateRows
					suppressCellFocus
					rowSelection="multiple"
					getRowId={(p) => p.data.id}
					onRowClicked={onRowClicked}
					rowStyle={{ cursor: "pointer" }}
					onGridReady={(params) => {
						params.api.sizeColumnsToFit();
						window.addEventListener("resize", () => params.api.sizeColumnsToFit());
					}}
					overlayLoadingTemplate={
						isLoading
							? '<span class="ag-overlay-loading-center text-muted-foreground">Loading…</span>'
							: undefined
					}
					overlayNoRowsTemplate='<span class="text-muted-foreground font-medium">No invoices found</span>'
				/>
			</div>

			{/* Detail Sheet */}
			<Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto px-4 pb-6">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-xl">
							{detail?.invoice_number || "Invoice Detail"}
						</SheetTitle>
						{detail?.description && (
							<p className="text-sm text-muted-foreground">{detail.description}</p>
						)}
					</SheetHeader>

					{detailFetcher.state === "loading" && (
						<div className="py-16 text-center text-muted-foreground">Loading details…</div>
					)}

					{detail && (
						<div className="mt-6 space-y-8 text-sm">
							{/* Amounts */}
							<section>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
									Amounts
								</h3>
								<div className="grid grid-cols-3 gap-4">
									<div>
										<p className="text-muted-foreground text-xs">Total</p>
										<p className="font-mono font-semibold text-base">
											{Number(detail.amount).toLocaleString("en-US", {
												style: "currency",
												currency: detail.currency || "USD",
											})}
										</p>
									</div>
									<div>
										<p className="text-muted-foreground text-xs">Paid</p>
										<p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
											{Number(detail.paid_amount).toLocaleString("en-US", {
												style: "currency",
												currency: detail.currency || "USD",
											})}
										</p>
									</div>
									<div>
										<p className="text-muted-foreground text-xs">Remaining</p>
										<p className="font-mono font-semibold text-base">
											{Number(detail.remaining_amount).toLocaleString("en-US", {
												style: "currency",
												currency: detail.currency || "USD",
											})}
										</p>
									</div>
								</div>

								<div className="mt-4">
									<Progress
										value={
											detail.amount > 0
												? Math.min(100, (detail.paid_amount / detail.amount) * 100)
												: 0
										}
										className="h-2"
									/>
								</div>
							</section>

							{/* Client + Status */}
							<section className="grid grid-cols-2 gap-6">
								<div>
									<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
										Client
									</h3>
									{detail.client ? (
										<>
											<p className="font-medium">{detail.client.name}</p>
											<p className="text-muted-foreground text-xs">
												{detail.client.email}
											</p>
										</>
									) : (
										<p className="text-muted-foreground italic">No client</p>
									)}
								</div>
								<div>
									<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
										Status
									</h3>
									<div className="flex items-center gap-2">
										<InvoiceStatusBadge status={detail.status} />
										{detail.is_overdue && (
											<span className="text-xs text-rose-500">
												{detail.days_overdue}d overdue
											</span>
										)}
									</div>
									{detail.due_date && (
										<p className="text-xs text-muted-foreground mt-1">
											Due {format(new Date(detail.due_date), "dd MMM yyyy")}
										</p>
									)}
								</div>
							</section>

							{/* Matches */}
							<section>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
									Payments Applied
								</h3>

								{(detail.matches || []).length === 0 ? (
									<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
										No payments matched yet
									</div>
								) : (
									<div className="space-y-3">
										{detail.matches.map((m: any) => (
											<div
												key={m.id}
												className="rounded-lg border bg-muted/30 p-4 space-y-2"
											>
												<div className="flex items-center justify-between">
													<span className="font-medium">
														{Number(m.amount_matched).toLocaleString("en-US", {
															style: "currency",
															currency: detail.currency || "USD",
														})}
													</span>
													<Badge
														variant="outline"
														className="capitalize text-[10px]"
													>
														{m.status}
													</Badge>
												</div>
												<div className="text-xs text-muted-foreground">
													{m.match_type.toUpperCase()} •{" "}
													{m.confidence != null &&
														`${Math.round(m.confidence * 100)}% • `}
													{m.transaction?.payer_name || "Unknown payer"}
												</div>
												{m.reasoning && (
													<p className="text-xs leading-relaxed text-muted-foreground bg-background/60 rounded-md p-2.5">
														{m.reasoning}
													</p>
												)}
											</div>
										))}
									</div>
								)}
							</section>
						</div>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}
