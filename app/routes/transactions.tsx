import { useLoaderData, useSearchParams, useNavigation, useFetcher } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useMemo, useCallback, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams, ICellRendererParams } from "ag-grid-community";
import { format } from "date-fns";

import { TransactionService } from "~/services/transactions.service.server";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";

export const meta = () => {
	return [{ title: "Transactions | LedgerPilot" }];
};

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

	const onRowClicked = useCallback(
		(event: any) => {
			const id = event.data.id;
			setSelectedId(id);
			detailFetcher.load(`/transactions/${id}`);
		},
		[detailFetcher],
	);

	return (
		<>
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

						<Select
							value={filters.source || "all"}
							onValueChange={(v) => updateFilter("source", v)}
						>
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
						onRowClicked={onRowClicked}
						rowStyle={{ cursor: "pointer" }}
					/>
				</div>
			</div>

			<Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto px-4 pb-6">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-xl">Transaction Detail</SheetTitle>
						{detailFetcher.data?.paypal_transaction_id && (
							<p className="text-sm text-muted-foreground font-mono">
								{detailFetcher.data.paypal_transaction_id}
							</p>
						)}
					</SheetHeader>

					{detailFetcher.state === "loading" && (
						<div className="py-16 text-center text-muted-foreground">Loading details…</div>
					)}

					{detailFetcher.data && (
						<div className="mt-6 space-y-8 text-sm">
							{/* ========== Amounts ========== */}
							<section>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
									Amounts
								</h3>
								<div className="grid grid-cols-3 gap-4">
									<div className="space-y-1">
										<p className="text-muted-foreground text-xs">Gross</p>
										<p className="font-mono font-semibold text-base">
											{Number(detailFetcher.data.amount).toLocaleString("en-US", {
												style: "currency",
												currency: detailFetcher.data.currency || "USD",
											})}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground text-xs">Fee</p>
										<p className="font-mono font-medium">
											{Number(detailFetcher.data.fee_amount || 0).toLocaleString(
												"en-US",
												{
													style: "currency",
													currency: detailFetcher.data.currency || "USD",
												},
											)}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground text-xs">Net</p>
										<p className="font-mono font-semibold text-base">
											{Number(detailFetcher.data.net_amount || 0).toLocaleString(
												"en-US",
												{
													style: "currency",
													currency: detailFetcher.data.currency || "USD",
												},
											)}
										</p>
									</div>
								</div>
							</section>

							{/* ========== Payer & Client ========== */}
							<section className="grid grid-cols-2 gap-6">
								<div>
									<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
										Payer
									</h3>
									<p className="font-medium">{detailFetcher.data.payer_name || "—"}</p>
									{detailFetcher.data.payer_email && (
										<p className="text-muted-foreground text-xs mt-0.5">
											{detailFetcher.data.payer_email}
										</p>
									)}
								</div>

								<div>
									<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
										Client
									</h3>
									{detailFetcher.data.client ? (
										<>
											<p className="font-medium">{detailFetcher.data.client.name}</p>
											<p className="text-muted-foreground text-xs mt-0.5">
												{detailFetcher.data.client.email}
											</p>
										</>
									) : (
										<p className="text-muted-foreground italic">No client linked</p>
									)}
								</div>
							</section>

							{/* ========== Meta ========== */}
							<section className="space-y-2">
								<div className="flex flex-wrap gap-2">
									<Badge variant="outline" className="capitalize">
										{detailFetcher.data.status}
									</Badge>
									<Badge variant="outline" className="capitalize">
										{detailFetcher.data.type}
									</Badge>
									<Badge
										variant={
											detailFetcher.data.source === "simulator"
												? "secondary"
												: "outline"
										}
										className="capitalize"
									>
										{detailFetcher.data.source}
									</Badge>
								</div>
								{detailFetcher.data.transaction_date && (
									<span className="text-xs text-muted-foreground self-center">
										{new Date(detailFetcher.data.transaction_date).toLocaleString()}
									</span>
								)}
							</section>

							{/* ========== Matches ========== */}
							<section>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
									Matches
								</h3>

								{(detailFetcher.data.matches || []).length === 0 ? (
									<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
										No matches yet
									</div>
								) : (
									<div className="space-y-3">
										{detailFetcher.data.matches.map((m: any) => (
											<div
												key={m.id}
												className="rounded-lg border bg-muted/30 p-4 space-y-2"
											>
												<div className="flex items-center justify-between gap-2">
													<div className="font-medium">
														{m.invoice?.invoice_number || "Unknown invoice"}
													</div>
													<Badge
														variant={
															m.status === "approved"
																? "default"
																: m.status === "proposed"
																	? "secondary"
																	: "outline"
														}
														className="capitalize"
													>
														{m.status}
													</Badge>
												</div>

												<div className="flex items-center gap-3 text-xs text-muted-foreground">
													<span className="capitalize">{m.match_type} match</span>
													<span>•</span>
													<span>
														{Number(m.amount_matched).toLocaleString("en-US", {
															style: "currency",
															currency: detailFetcher.data.currency || "USD",
														})}
													</span>
													{m.confidence != null && (
														<>
															<span>•</span>
															<span>
																{Math.round(m.confidence * 100)}% confidence
															</span>
														</>
													)}
												</div>

												{m.reasoning && (
													<p className="text-xs leading-relaxed text-muted-foreground bg-background/60 rounded-md p-2.5">
														{m.reasoning}
													</p>
												)}

												{m.invoice && (
													<div className="text-xs text-muted-foreground pt-1">
														Invoice: {m.invoice.invoice_number} •{" "}
														{Number(m.invoice.amount).toLocaleString("en-US", {
															style: "currency",
															currency: detailFetcher.data.currency || "USD",
														})}{" "}
														•{" "}
														<span className="capitalize">{m.invoice.status}</span>
													</div>
												)}
											</div>
										))}
									</div>
								)}
							</section>

							{/* ========== Annotations ========== */}
							<section>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
									Annotations
								</h3>

								{(detailFetcher.data.annotations || []).length === 0 ? (
									<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
										No annotations
									</div>
								) : (
									<div className="space-y-3">
										{detailFetcher.data.annotations.map((a: any) => (
											<div
												key={a.id}
												className="rounded-lg border p-4 flex items-start justify-between gap-3"
											>
												<div className="space-y-1">
													{a.category && (
														<p className="font-medium">{a.category}</p>
													)}
													{a.anomaly_type && (
														<div className="flex items-center gap-2">
															<Badge
																variant="destructive"
																className="text-[10px]"
															>
																{a.anomaly_type
																	.split("_")
																	.join(" ")
																	.toUpperCase()}
															</Badge>
															{a.confidence != null && (
																<span className="text-xs text-muted-foreground">
																	{Math.round(a.confidence * 100)}%
																</span>
															)}
														</div>
													)}
													{a.anomaly_reason && (
														<p className="text-xs text-muted-foreground leading-relaxed">
															{a.anomaly_reason}
														</p>
													)}
												</div>
												<span className="text-[10px] text-muted-foreground whitespace-nowrap">
													{a.created_by?.toUpperCase()}
												</span>
											</div>
										))}
									</div>
								)}
							</section>
						</div>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}
