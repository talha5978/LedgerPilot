import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { ApprovalsService, type PendingActionWithDetails } from "~/services/approvals.service.server";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
	Send,
	RefreshCw,
	Check,
	X,
	Sparkles,
	Clock,
	FileText,
	UserCheck,
	CreditCard,
	Mail,
	DollarSign,
} from "lucide-react";

export async function loader({ request }: LoaderFunctionArgs) {
	const approvalsService = new ApprovalsService(request);
	const result = await approvalsService.listPending();

	if (result.error) {
		throw new Response(result.error.message, { status: result.error.status });
	}

	return { pendingActions: result.data || [] };
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const intent = formData.get("intent");
	const actionId = formData.get("actionId") as string;

	if (!actionId) {
		return { error: "Action ID is required" };
	}

	const approvalsService = new ApprovalsService(request);

	if (intent === "approve") {
		const res = await approvalsService.approveAction(actionId);
		if (res.error) return { error: res.error.message };
		return { success: true, message: "Action approved and executed on PayPal!" };
	}

	if (intent === "reject") {
		const res = await approvalsService.rejectAction(actionId);
		if (res.error) return { error: res.error.message };
		return { success: true, message: "Action rejected." };
	}

	return { error: "Invalid intent" };
}

export default function ApprovalsPage() {
	const { pendingActions } = useLoaderData<typeof loader>();
	const submit = useSubmit();
	const navigation = useNavigation();

	const isSubmitting = navigation.state === "submitting";

	const handleDecision = (actionId: string, intent: "approve" | "reject") => {
		const formData = new FormData();
		formData.append("intent", intent);
		formData.append("actionId", actionId);
		submit(formData, { method: "POST" });
	};

	const getActionBadge = (type: string) => {
		switch (type) {
			case "send_invoice_reminder":
				return (
					<Badge variant="secondary" className="gap-1.5 font-medium border-border/50 text-xs">
						<Send className="w-3 h-3 text-primary" /> Send Reminder
					</Badge>
				);
			case "refund_capture":
				return (
					<Badge
						variant="outline"
						className="gap-1.5 font-medium border-destructive/40 text-destructive bg-destructive/10 text-xs"
					>
						<RefreshCw className="w-3 h-3" /> Issue Refund
					</Badge>
				);
			case "assign_client":
				return (
					<Badge variant="secondary" className="gap-1.5 font-medium border-border/50 text-xs">
						<UserCheck className="w-3 h-3 text-primary" /> Assign Client
					</Badge>
				);
			default:
				return (
					<Badge variant="outline" className="text-xs">
						{type.replace("_", " ").toUpperCase()}
					</Badge>
				);
		}
	};

	return (
		<div className="container mx-auto p-6 max-w-6xl space-y-8">
			{/* Page Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
						Pending Approvals <Sparkles className="w-5 h-5 text-primary animate-pulse" />
					</h1>
					<p className="text-muted-foreground text-sm">
						Review AI-proposed actions before they execute on PayPal.
					</p>
				</div>
				<Badge variant="secondary" className="w-fit text-xs px-3 py-1 font-medium gap-1.5">
					<Clock className="w-3.5 h-3.5 text-muted-foreground" />
					{pendingActions.length} Pending Proposal{pendingActions.length === 1 ? "" : "s"}
				</Badge>
			</div>

			{/* Empty State */}
			{pendingActions.length === 0 ? (
				<Card className="text-center py-16 border-dashed border-2 border-border/60 bg-card/50 max-w-xl mx-auto">
					<CardContent className="space-y-4">
						<div className="w-14 h-14 rounded-full bg-accent/50 border border-border flex items-center justify-center mx-auto text-primary">
							<Check className="w-7 h-7" />
						</div>
						<div className="space-y-1">
							<h3 className="text-lg font-semibold tracking-tight">
								All clear! No pending actions
							</h3>
							<p className="text-sm text-muted-foreground max-w-md mx-auto">
								The background agent has no pending proposals waiting for review. New
								suggestions will appear here automatically.
							</p>
						</div>
					</CardContent>
				</Card>
			) : (
				/* Multi-column Grid Layout (Not Wide Cards) */
				<div className="grid grid-cols-1 md:grid-cols-2 gap-5">
					{pendingActions.map((item: PendingActionWithDetails) => {
						const payload = item.payload as any;

						return (
							<Card
								key={item.id}
								className="border-border/60 bg-card hover:border-border hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
							>
								<div>
									{/* Card Header */}
									<CardHeader className="pb-3 pt-5 px-5 space-y-2">
										<div className="flex items-center justify-between gap-2">
											{getActionBadge(item.action_type)}
											<span className="text-[11px] text-muted-foreground flex items-center gap-1">
												<Clock className="w-3 h-3" />
												{new Date(item.proposed_at).toLocaleTimeString([], {
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
										</div>
										<CardTitle className="text-base font-semibold tracking-tight leading-snug">
											{item.action_type === "send_invoice_reminder" &&
												`Send reminder for Invoice #${item.invoice?.invoice_number || "N/A"}`}
											{item.action_type === "refund_capture" &&
												`Issue Refund of $${payload?.amount?.value || item.transaction?.amount || "0.00"}`}
											{item.action_type === "assign_client" &&
												`Link Transaction to Client`}
										</CardTitle>
									</CardHeader>

									{/* Card Body */}
									<CardContent className="space-y-3 text-xs sm:text-sm px-5 pb-4">
										{/* Reasoning Callout */}
										<div className="bg-muted/50 p-3 rounded-lg border border-border/50 space-y-1">
											<div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
												<Sparkles className="w-3 h-3 text-primary" /> Reasoning
											</div>
											<p className="text-foreground leading-relaxed">
												{item.reasoning || "No reasoning provided."}
											</p>
										</div>

										{/* Related Invoice Details Box */}
										{item.invoice && (
											<div className="bg-muted/30 p-2.5 rounded-lg border border-border/40 space-y-1.5 text-xs">
												<div className="flex items-center justify-between font-medium">
													<span className="flex items-center gap-1.5 text-foreground">
														<FileText className="w-3.5 h-3.5 text-primary" />
														Invoice #{item.invoice.invoice_number || "N/A"}
													</span>
													<Badge
														variant="outline"
														className="text-[10px] uppercase px-1.5 py-0.2"
													>
														{item.invoice.status}
													</Badge>
												</div>
												<div className="flex items-center justify-between text-muted-foreground">
													<span>Invoice Amount:</span>
													<span className="font-semibold text-foreground">
														{item.invoice.currency} $
														{item.invoice.amount.toFixed(2)}
													</span>
												</div>
											</div>
										)}

										{/* Related Transaction Details Box */}
										{item.transaction && (
											<div className="bg-muted/30 p-2.5 rounded-lg border border-border/40 space-y-1.5 text-xs">
												<div className="flex items-center justify-between font-medium">
													<span className="flex items-center gap-1.5 text-foreground truncate">
														<CreditCard className="w-3.5 h-3.5 text-primary shrink-0" />
														<span className="truncate">
															Txn:{" "}
															{item.transaction.paypal_transaction_id ||
																item.transaction.id.slice(0, 8)}
														</span>
													</span>
													<span className="font-semibold text-foreground shrink-0">
														{item.transaction.currency} $
														{item.transaction.amount.toFixed(2)}
													</span>
												</div>
												{(item.transaction.payer_name ||
													item.transaction.payer_email) && (
													<div className="flex items-center gap-1.5 text-muted-foreground truncate pt-0.5">
														<Mail className="w-3.5 h-3.5 shrink-0" />
														<span
															className="truncate"
															title={item.transaction.payer_email || ""}
														>
															{item.transaction.payer_name
																? `${item.transaction.payer_name} (${item.transaction.payer_email})`
																: item.transaction.payer_email}
														</span>
													</div>
												)}
											</div>
										)}

										{/* Action Specific Context Preview (Reminders / Refunds) */}
										{item.action_type === "send_invoice_reminder" && payload?.subject && (
											<div className="space-y-1 border-l-2 border-primary/60 pl-3 py-0.5">
												<div className="text-xs font-medium text-foreground truncate">
													Subject:{" "}
													<span className="text-muted-foreground font-normal">
														{payload.subject}
													</span>
												</div>
												{payload?.note && (
													<p className="text-muted-foreground text-xs italic bg-accent/30 p-2 rounded border border-border/20 line-clamp-2">
														"{payload.note}"
													</p>
												)}
											</div>
										)}

										{item.action_type === "refund_capture" && payload?.capture_id && (
											<div className="flex items-center gap-1.5 text-xs text-muted-foreground border-l-2 border-destructive/60 pl-3 py-0.5">
												<DollarSign className="w-3.5 h-3.5 text-destructive shrink-0" />
												<span className="truncate">
													Capture ID:{" "}
													<code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">
														{payload.capture_id}
													</code>
												</span>
											</div>
										)}
									</CardContent>
								</div>

								{/* Card Footer Actions */}
								<CardFooter className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/40 bg-muted/20 mt-auto">
									<Button
										variant="outline"
										size="sm"
										disabled={isSubmitting}
										onClick={() => handleDecision(item.id, "reject")}
										className="h-8 text-xs gap-1 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
									>
										<X className="w-3.5 h-3.5" /> Reject
									</Button>
									<Button
										size="sm"
										disabled={isSubmitting}
										onClick={() => handleDecision(item.id, "approve")}
										className="h-8 text-xs gap-1 shadow-sm"
									>
										<Check className="w-3.5 h-3.5" /> Approve & Execute
									</Button>
								</CardFooter>
							</Card>
						);
					})}
				</div>
			)}
		</div>
	);
}
