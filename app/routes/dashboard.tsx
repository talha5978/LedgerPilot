import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { format, formatDistanceToNow } from "date-fns";
import {
	ArrowLeftRight,
	FileText,
	CheckSquare,
	AlertTriangle,
	Clock,
	TrendingUp,
	Wallet,
	Bot,
	ArrowRight,
	CircleDollarSign,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { DashboardService } from "~/services/dashboard.service.server";

export const meta = () => {
	return [{ title: "Dashboard | LedgerPilot" }];
};

// --------------------------------------------------
// Loader
// --------------------------------------------------
export async function loader({ request }: LoaderFunctionArgs) {
	const svc = new DashboardService(request);
	const data = await svc.getDashboard();
	return data;
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function money(n: number, currency = "USD") {
	return n.toLocaleString("en-US", { style: "currency", currency });
}

function actionLabel(type: string) {
	const map: Record<string, string> = {
		send_invoice_reminder: "Send reminder",
		send_reminder: "Send reminder",
		refund_capture: "Refund capture",
		issue_refund: "Issue refund",
		assign_client: "Assign client",
		apply_match: "Apply match",
	};
	return map[type] || type.replace(/_/g, " ");
}

// --------------------------------------------------
// Page
// --------------------------------------------------
export default function DashboardPage() {
	const { kpis, pending, recentTx, recentAudit, anomalies, overdueInvoices } =
		useLoaderData<typeof loader>();

	const attentionScore = kpis.pendingCount + kpis.overdueCount + Math.min(kpis.unmatchedCount, 10);

	return (
		<div className="mx-auto max-w-7xl space-y-8 p-6">
			{/* Hero */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						LedgerPilot
					</p>
					<h1 className="text-2xl font-bold tracking-tight md:text-3xl">Finance command center</h1>
					<p className="mt-1 max-w-xl text-sm text-muted-foreground">
						PayPal money in, invoices reconciled, anomalies flagged — every money-moving step
						waits for your approval.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline" size="sm">
						<Link to="/transactions">
							<ArrowLeftRight className="mr-2 h-4 w-4" />
							Transactions
						</Link>
					</Button>
					<Button asChild size="sm">
						<Link to="/approvals">
							<CheckSquare className="mr-2 h-4 w-4" />
							Approvals
							{kpis.pendingCount > 0 && (
								<Badge className="ml-2 h-5 min-w-5 justify-center px-1" variant="secondary">
									{kpis.pendingCount}
								</Badge>
							)}
						</Link>
					</Button>
				</div>
			</div>

			{/* KPI row */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="shadow-sm">
					<CardContent className="p-5">
						<div className="flex items-start justify-between">
							<div>
								<p className="text-xs text-muted-foreground">Received (this month)</p>
								<p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
									{money(kpis.receivedNet)}
								</p>
								<p className="mt-1 text-[11px] text-muted-foreground">
									Gross {money(kpis.receivedGross)} · Fees {money(kpis.fees)}
								</p>
							</div>
							<div className="rounded-md border bg-muted/40 p-2">
								<Wallet className="h-4 w-4 text-muted-foreground" />
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="shadow-sm">
					<CardContent className="p-5">
						<div className="flex items-start justify-between">
							<div>
								<p className="text-xs text-muted-foreground">Open invoices</p>
								<p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
									{money(kpis.openTotal)}
								</p>
								<p className="mt-1 text-[11px] text-muted-foreground">
									{kpis.openCount} invoice{kpis.openCount !== 1 ? "s" : ""} outstanding
								</p>
							</div>
							<div className="rounded-md border bg-muted/40 p-2">
								<FileText className="h-4 w-4 text-muted-foreground" />
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="shadow-sm">
					<CardContent className="p-5">
						<div className="flex items-start justify-between">
							<div>
								<p className="text-xs text-muted-foreground">Overdue</p>
								<p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-rose-600 dark:text-rose-400">
									{money(kpis.overdueTotal)}
								</p>
								<p className="mt-1 text-[11px] text-muted-foreground">
									{kpis.overdueCount} need follow-up
								</p>
							</div>
							<div className="rounded-md border bg-muted/40 p-2">
								<Clock className="h-4 w-4 text-muted-foreground" />
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="shadow-sm">
					<CardContent className="p-5">
						<div className="flex items-start justify-between">
							<div>
								<p className="text-xs text-muted-foreground">Awaiting your approval</p>
								<p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
									{kpis.pendingCount}
								</p>
								<p className="mt-1 text-[11px] text-muted-foreground">
									Agent proposed · you decide
								</p>
							</div>
							<div className="rounded-md border bg-muted/40 p-2">
								<Bot className="h-4 w-4 text-muted-foreground" />
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Attention banner */}
			{attentionScore > 0 && (
				<Card className="border-dashed bg-muted/30 shadow-none">
					<CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-start gap-3">
							<div className="mt-0.5 rounded-md border bg-background p-2">
								<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
							</div>
							<div>
								<p className="text-sm font-medium">Needs your attention</p>
								<p className="text-xs text-muted-foreground">
									{kpis.pendingCount} approval{kpis.pendingCount !== 1 ? "s" : ""}
									{" · "}
									{kpis.overdueCount} overdue
									{" · "}
									{kpis.unmatchedCount} payment{kpis.unmatchedCount !== 1 ? "s" : ""}{" "}
									without an approved match
								</p>
							</div>
						</div>
						<Button asChild size="sm">
							<Link to="/approvals">
								Review queue
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
					</CardContent>
				</Card>
			)}

			<div className="grid gap-6 lg:grid-cols-5">
				{/* Left: Approvals + Overdue */}
				<div className="space-y-6 lg:col-span-3">
					{/* Pending approvals */}
					<Card className="shadow-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
							<div>
								<CardTitle className="text-base">Approval queue</CardTitle>
								<CardDescription>
									AI drafts the action — nothing hits PayPal until you approve
								</CardDescription>
							</div>
							<Button asChild variant="ghost" size="sm">
								<Link to="/approvals">View all</Link>
							</Button>
						</CardHeader>
						<CardContent className="space-y-2">
							{pending.length === 0 ? (
								<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
									Queue is clear. Agent has nothing waiting.
								</div>
							) : (
								pending.map((p) => (
									<div
										key={p.id}
										className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3"
									>
										<div className="min-w-0 space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant="secondary" className="capitalize text-[10px]">
													{actionLabel(p.action_type)}
												</Badge>
												<span className="text-[11px] text-muted-foreground">
													{p.proposed_at
														? formatDistanceToNow(new Date(p.proposed_at), {
																addSuffix: true,
															})
														: ""}
												</span>
											</div>
											<p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
												{p.reasoning || "No reasoning provided"}
											</p>
										</div>
										<Button asChild size="sm" variant="outline" className="shrink-0">
											<Link to="/approvals">Review</Link>
										</Button>
									</div>
								))
							)}
						</CardContent>
					</Card>

					{/* Overdue invoices */}
					<Card className="shadow-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
							<div>
								<CardTitle className="text-base">Overdue invoices</CardTitle>
								<CardDescription>
									Cash still out — reminders live in Approvals
								</CardDescription>
							</div>
							<Button asChild variant="ghost" size="sm">
								<Link to="/invoices?overdueOnly=true">Invoices</Link>
							</Button>
						</CardHeader>
						<CardContent>
							{overdueInvoices.length === 0 ? (
								<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
									No overdue invoices
								</div>
							) : (
								<div className="divide-y">
									{overdueInvoices.map((inv: any) => (
										<div
											key={inv.id}
											className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
										>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{inv.invoice_number || "Invoice"}
												</p>
												<p className="text-xs text-muted-foreground">
													{(inv.client as any)?.name || "Client"}
													{inv.due_date
														? ` · due ${format(new Date(inv.due_date), "dd MMM yyyy")}`
														: ""}
												</p>
											</div>
											<p className="shrink-0 font-mono text-sm font-medium tabular-nums text-rose-600 dark:text-rose-400">
												{money(Number(inv.amount))}
											</p>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Right: activity + anomalies + health */}
				<div className="space-y-6 lg:col-span-2">
					{/* Reconciliation health */}
					<Card className="shadow-sm">
						<CardHeader className="pb-2">
							<CardTitle className="text-base">Reconciliation pulse</CardTitle>
							<CardDescription>This month’s payment volume</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Payments ingested</span>
								<span className="font-medium tabular-nums">{kpis.paymentCount}</span>
							</div>
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Unmatched (sample)</span>
								<span className="font-medium tabular-nums">{kpis.unmatchedCount}</span>
							</div>
							<div className="space-y-1.5">
								<div className="flex justify-between text-[11px] text-muted-foreground">
									<span>Matched coverage (est.)</span>
									<span>
										{kpis.paymentCount
											? Math.max(
													0,
													Math.round(
														(1 -
															kpis.unmatchedCount /
																Math.max(kpis.paymentCount, 1)) *
															100,
													),
												)
											: 0}
										%
									</span>
								</div>
								<Progress
									value={
										kpis.paymentCount
											? Math.max(
													0,
													(1 -
														kpis.unmatchedCount /
															Math.max(kpis.paymentCount, 1)) *
														100,
												)
											: 0
									}
									className="h-1.5"
								/>
							</div>
							<div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
								<TrendingUp className="h-3.5 w-3.5 shrink-0" />
								Rules first, then agent — LLM only when ambiguous.
							</div>
						</CardContent>
					</Card>

					{/* Anomalies */}
					<Card className="shadow-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
							<CardTitle className="text-base">Recent anomalies</CardTitle>
							<Button asChild variant="ghost" size="sm">
								<Link to="/transactions?hasAnomaly=true">View</Link>
							</Button>
						</CardHeader>
						<CardContent className="space-y-2">
							{anomalies.length === 0 ? (
								<p className="text-sm text-muted-foreground">No anomalies flagged</p>
							) : (
								anomalies.map((a) => (
									<div key={a.id} className="rounded-md border p-2.5 space-y-1">
										<div className="flex items-center justify-between gap-2">
											<Badge variant="destructive" className="text-[10px]">
												{(a.anomaly_type || "flag").replace(/_/g, " ")}
											</Badge>
											{a.confidence != null && (
												<span className="text-[10px] text-muted-foreground">
													{Math.round(Number(a.confidence) * 100)}%
												</span>
											)}
										</div>
										<p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
											{a.anomaly_reason}
										</p>
									</div>
								))
							)}
						</CardContent>
					</Card>

					{/* Agent activity */}
					<Card className="shadow-sm">
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Agent activity</CardTitle>
							<CardDescription>Audit trail of automated decisions</CardDescription>
						</CardHeader>
						<CardContent className="space-y-0">
							{recentAudit.length === 0 ? (
								<p className="text-sm text-muted-foreground">No activity yet</p>
							) : (
								<ul className="space-y-3">
									{recentAudit.map((log) => (
										<li key={log.id} className="flex gap-3 text-xs">
											<div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
											<div className="min-w-0">
												<p className="font-medium capitalize">
													{(log.action_type || "").replace(/_/g, " ")}
												</p>
												<p className="text-muted-foreground">
													{log.performed_by}
													{log.created_at
														? ` · ${formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}`
														: ""}
												</p>
											</div>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Recent transactions strip */}
			<Card className="shadow-sm">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
					<div>
						<CardTitle className="text-base">Latest payments</CardTitle>
						<CardDescription>Newest money into your PayPal account</CardDescription>
					</div>
					<Button asChild variant="ghost" size="sm">
						<Link to="/transactions">
							Open grid
							<ArrowRight className="ml-1 h-4 w-4" />
						</Link>
					</Button>
				</CardHeader>
				<CardContent>
					{recentTx.length === 0 ? (
						<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
							No transactions yet — use Demo Controls to simulate captures
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b text-left text-xs text-muted-foreground">
										<th className="pb-2 pr-4 font-medium">Date</th>
										<th className="pb-2 pr-4 font-medium">Payer</th>
										<th className="pb-2 pr-4 font-medium">Client</th>
										<th className="pb-2 pr-4 font-medium text-right">Amount</th>
										<th className="pb-2 font-medium">Source</th>
									</tr>
								</thead>
								<tbody>
									{recentTx.map((t: any) => (
										<tr key={t.id} className="border-b border-border/60 last:border-0">
											<td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
												{t.transaction_date
													? format(new Date(t.transaction_date), "dd MMM HH:mm")
													: "—"}
											</td>
											<td className="py-2.5 pr-4">
												{t.payer_name || t.payer_email || "—"}
											</td>
											<td className="py-2.5 pr-4 text-muted-foreground">
												{t.client?.name || "—"}
											</td>
											<td className="py-2.5 pr-4 text-right font-mono tabular-nums font-medium">
												{money(Number(t.amount), t.currency || "USD")}
											</td>
											<td className="py-2.5">
												<Badge variant="outline" className="capitalize text-[10px]">
													{t.source}
												</Badge>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Product story footer */}
			<div className="grid gap-3 sm:grid-cols-3">
				{[
					{
						icon: CircleDollarSign,
						title: "PayPal-native",
						body: "Captures, invoices, and refunds flow through the same ingest pipeline as production webhooks.",
					},
					{
						icon: Bot,
						title: "Rules first, AI second",
						body: "Exact matches are free and instant. Gemini only runs when the case is ambiguous.",
					},
					{
						icon: CheckSquare,
						title: "Human in the loop",
						body: "Reminders and refunds never fire alone — Approvals is the trust layer judges care about.",
					},
				].map((item) => (
					<div key={item.title} className="rounded-lg border bg-card p-4 shadow-sm">
						<item.icon className="mb-2 h-4 w-4 text-muted-foreground" />
						<p className="text-sm font-medium">{item.title}</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
					</div>
				))}
			</div>
		</div>
	);
}
