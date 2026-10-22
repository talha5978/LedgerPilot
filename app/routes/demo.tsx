import {
	Form,
	useActionData,
	useLoaderData,
	useNavigation,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import {
	FlaskConical,
	Zap,
	Copy,
	UserX,
	Clock,
	RotateCcw,
	Receipt,
	Split,
	Layers,
	AlertTriangle,
} from "lucide-react";

import { IngestService } from "~/services/ingest.service.server";
import { AgentService } from "~/services/agent.service.server";
import { BaseService } from "~/services/base.server.service";
import { ApiError } from "~/utils/errors/ApiError";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

export const meta = () => {
	return [{ title: "Demo Simulation | LedgerPilot" }];
};

// ============================================================
// Scenario payload builders (PayPal-shaped, controlled data)
// Align emails/amounts with your seed clients/invoices
// ============================================================

const SCENARIOS = {
	exact_match: {
		id: "exact_match",
		title: "Exact match payment",
		description:
			"CAPTURE.COMPLETED — $1200 from billing@acmedesign.co (matches Acme paid-style invoice amount).",
		icon: Zap,
		eventType: "PAYMENT.CAPTURE.COMPLETED",
		build: () => ({
			id: `WH-EXACT-${Date.now()}`,
			event_type: "PAYMENT.CAPTURE.COMPLETED",
			resource: {
				id: `CAP-EXACT-${Date.now()}`,
				status: "COMPLETED",
				amount: { value: "1200.00", currency_code: "USD" },
				seller_receivable_breakdown: {
					gross_amount: { value: "1200.00", currency_code: "USD" },
					paypal_fee: { value: "34.80", currency_code: "USD" },
					net_amount: { value: "1165.20", currency_code: "USD" },
				},
				payer: {
					email_address: "billing@acmedesign.co",
					name: { given_name: "Acme", surname: "Design Studio" },
				},
				create_time: new Date().toISOString(),
			},
		}),
	},
	partial_payment: {
		id: "partial_payment",
		title: "Partial payment",
		description: "CAPTURE.COMPLETED — $500 from Acme against an $850-style open invoice (partial).",
		icon: Split,
		eventType: "PAYMENT.CAPTURE.COMPLETED",
		build: () => ({
			id: `WH-PARTIAL-${Date.now()}`,
			event_type: "PAYMENT.CAPTURE.COMPLETED",
			resource: {
				id: `CAP-PARTIAL-${Date.now()}`,
				status: "COMPLETED",
				amount: { value: "500.00", currency_code: "USD" },
				seller_receivable_breakdown: {
					gross_amount: { value: "500.00", currency_code: "USD" },
					paypal_fee: { value: "14.50", currency_code: "USD" },
					net_amount: { value: "485.50", currency_code: "USD" },
				},
				payer: {
					email_address: "billing@acmedesign.co",
					name: { given_name: "Acme", surname: "Design Studio" },
				},
				create_time: new Date().toISOString(),
			},
		}),
	},
	bulk_payment: {
		id: "bulk_payment",
		title: "Bulk payment ($1050)",
		description:
			"Single capture covering two BrightTech invoices ($450 + $600). Rules may not auto-split → agent path.",
		icon: Layers,
		eventType: "PAYMENT.CAPTURE.COMPLETED",
		build: () => ({
			id: `WH-BULK-${Date.now()}`,
			event_type: "PAYMENT.CAPTURE.COMPLETED",
			resource: {
				id: `CAP-BULK-${Date.now()}`,
				status: "COMPLETED",
				amount: { value: "1050.00", currency_code: "USD" },
				seller_receivable_breakdown: {
					gross_amount: { value: "1050.00", currency_code: "USD" },
					paypal_fee: { value: "30.45", currency_code: "USD" },
					net_amount: { value: "1019.55", currency_code: "USD" },
				},
				payer: {
					email_address: "ap@brighttech.io",
					name: { given_name: "Bright", surname: "Tech" },
				},
				create_time: new Date().toISOString(),
			},
		}),
	},
	duplicate: {
		id: "duplicate",
		title: "Duplicate charge",
		description:
			"Second $1200 from same Acme email — should flag anomaly + propose refund pending action.",
		icon: Copy,
		eventType: "PAYMENT.CAPTURE.COMPLETED",
		build: () => ({
			id: `WH-DUP-${Date.now()}`,
			event_type: "PAYMENT.CAPTURE.COMPLETED",
			resource: {
				id: `CAP-DUP-${Date.now()}`,
				status: "COMPLETED",
				amount: { value: "1200.00", currency_code: "USD" },
				seller_receivable_breakdown: {
					gross_amount: { value: "1200.00", currency_code: "USD" },
					paypal_fee: { value: "34.80", currency_code: "USD" },
					net_amount: { value: "1165.20", currency_code: "USD" },
				},
				payer: {
					email_address: "billing@acmedesign.co",
					name: { given_name: "Acme", surname: "Design Studio" },
				},
				create_time: new Date().toISOString(),
			},
		}),
	},
	unknown_payer: {
		id: "unknown_payer",
		title: "Unknown payer",
		description: "Payment from an email not in clients — agent may propose assign_client.",
		icon: UserX,
		eventType: "PAYMENT.CAPTURE.COMPLETED",
		build: () => ({
			id: `WH-UNK-${Date.now()}`,
			event_type: "PAYMENT.CAPTURE.COMPLETED",
			resource: {
				id: `CAP-UNK-${Date.now()}`,
				status: "COMPLETED",
				amount: { value: "320.00", currency_code: "USD" },
				seller_receivable_breakdown: {
					gross_amount: { value: "320.00", currency_code: "USD" },
					paypal_fee: { value: "9.28", currency_code: "USD" },
					net_amount: { value: "310.72", currency_code: "USD" },
				},
				payer: {
					email_address: "payments@novamedia.tv",
					name: { given_name: "N.", surname: "Media LLC" },
				},
				create_time: new Date().toISOString(),
			},
		}),
	},
	fee_spike: {
		id: "fee_spike",
		title: "Fee spike",
		description: "$975 capture with abnormally high fee (~8%) — anomaly flag path.",
		icon: AlertTriangle,
		eventType: "PAYMENT.CAPTURE.COMPLETED",
		build: () => ({
			id: `WH-FEE-${Date.now()}`,
			event_type: "PAYMENT.CAPTURE.COMPLETED",
			resource: {
				id: `CAP-FEE-${Date.now()}`,
				status: "COMPLETED",
				amount: { value: "975.00", currency_code: "USD" },
				seller_receivable_breakdown: {
					gross_amount: { value: "975.00", currency_code: "USD" },
					paypal_fee: { value: "78.00", currency_code: "USD" },
					net_amount: { value: "897.00", currency_code: "USD" },
				},
				payer: {
					email_address: "finance@greenleaf.com",
					name: { given_name: "Green", surname: "Leaf" },
				},
				create_time: new Date().toISOString(),
			},
		}),
	},
	invoice_created: {
		id: "invoice_created",
		title: "New invoice (PayPal)",
		description: "INVOICING.INVOICE.CREATED for a new Acme invoice.",
		icon: Receipt,
		eventType: "INVOICING.INVOICE.CREATED",
		build: () => {
			const n = Math.floor(Math.random() * 9000) + 1000;
			return {
				id: `WH-INV-${Date.now()}`,
				event_type: "INVOICING.INVOICE.CREATED",
				resource: {
					id: `INV2-SIM-${n}`,
					status: "SENT",
					detail: {
						invoice_number: `INV-SIM-${n}`,
						invoice_date: new Date().toISOString().slice(0, 10),
						currency_code: "USD",
						payment_term: {
							due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
						},
						note: "Simulated invoice from Demo Controls",
						amount: { value: "750.00", currency_code: "USD" },
					},
					amount: { value: "750.00", currency_code: "USD" },
					primary_recipients: [
						{
							billing_info: {
								email_address: "billing@acmedesign.co",
								name: { full_name: "Acme Design Studio" },
							},
						},
					],
				},
			};
		},
	},
	ignored_checkout: {
		id: "ignored_checkout",
		title: "Ignored: PAYMENTS.PAYMENT.CREATED",
		description: "Should only log webhook_events — no transaction (proves ignore path).",
		icon: FlaskConical,
		eventType: "PAYMENTS.PAYMENT.CREATED",
		build: () => ({
			id: `WH-IGN-${Date.now()}`,
			event_type: "PAYMENTS.PAYMENT.CREATED",
			resource: {
				id: `PAY-IGN-${Date.now()}`,
				state: "created",
				intent: "sale",
				payer: {
					payer_info: {
						email: "customer@example.com",
						first_name: "John",
						last_name: "Doe",
					},
				},
				transactions: [
					{
						amount: { total: "4.13", currency: "USD" },
					},
				],
				create_time: new Date().toISOString(),
			},
		}),
	},
} as const;

type ScenarioId = keyof typeof SCENARIOS;

// ============================================================
// Loader — live counts for the demo user
// ============================================================
export async function loader({ request }: LoaderFunctionArgs) {
	class DemoStats extends BaseService {
		async stats() {
			const profileId = await this.getProfileId();
			const [tx, inv, matches, pending, webhooks] = await Promise.all([
				this.supabase
					.from(this.TRANSACTIONS_TABLE)
					.select("id", { count: "exact", head: true })
					.eq("profile_id", profileId),
				this.supabase
					.from(this.INVOICES_TABLE)
					.select("id", { count: "exact", head: true })
					.eq("profile_id", profileId),
				this.supabase
					.from(this.MATCHES_TABLE)
					.select("id, transactions!inner(profile_id)", {
						count: "exact",
						head: true,
					})
					.eq("transactions.profile_id", profileId),
				this.supabase
					.from(this.PENDING_ACTIONS_TABLE)
					.select("id", { count: "exact", head: true })
					.eq("profile_id", profileId)
					.eq("status", "pending"),
				this.supabase.from(this.WEBHOOK_EVENTS_TABLE).select("id", { count: "exact", head: true }),
			]);

			return {
				transactions: tx.count ?? 0,
				invoices: inv.count ?? 0,
				matches: matches.count ?? 0,
				pendingActions: pending.count ?? 0,
				webhookEvents: webhooks.count ?? 0,
			};
		}

		private async getProfileId() {
			const {
				data: { user },
			} = await this.supabase.auth.getUser();
			if (!user) throw new Response("Unauthorized", { status: 401 });
			return user.id;
		}
	}

	try {
		const stats = await new DemoStats(request).stats();
		return { stats };
	} catch {
		return {
			stats: {
				transactions: 0,
				invoices: 0,
				matches: 0,
				pendingActions: 0,
				webhookEvents: 0,
			},
		};
	}
}

// ============================================================
// Action
// ============================================================
export async function action({ request }: ActionFunctionArgs) {
	const form = await request.formData();
	const intent = String(form.get("intent") || "");

	try {
		const ingest = new IngestService(request);
		const agent = new AgentService(request);

		if (intent === "simulate") {
			const scenarioId = String(form.get("scenario") || "") as ScenarioId;
			const scenario = SCENARIOS[scenarioId];
			if (!scenario) {
				return { ok: false, message: "Unknown scenario" };
			}

			const payload = scenario.build();
			const result = await ingest.processSimulatorEvent(payload, scenario.eventType);

			return {
				ok: true,
				message: result.ignored
					? `Ignored: ${result.reason || scenario.title}`
					: `Simulated: ${scenario.title}`,
				result,
			};
		}

		if (intent === "overdue_check") {
			const result = await agent.runOverdueCheck();
			if (result.error) {
				return { ok: false, message: result.error.message };
			}
			const n = result.data?.draftedReminders?.length ?? 0;
			return {
				ok: true,
				message: `Overdue check done — ${n} reminder(s) proposed`,
				result: result.data,
			};
		}

		if (intent === "advance_clock") {
			// Push due_date of open invoices into the past so overdue detection works
			class ClockService extends BaseService {
				async advance() {
					const {
						data: { user },
					} = await this.supabase.auth.getUser();
					if (!user) throw new ApiError("Unauthorized", 401);

					const past = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);

					const { data, error } = await this.supabase
						.from(this.INVOICES_TABLE)
						.update({
							due_date: past,
							status: "overdue",
						})
						.eq("profile_id", user.id)
						.in("status", ["sent", "partially_paid", "overdue"])
						.select("id");

					if (error) throw new ApiError(error.message, 500);
					return data?.length ?? 0;
				}
			}

			const n = await new ClockService(request).advance();
			return {
				ok: true,
				message: `Demo clock advanced — ${n} invoice(s) marked overdue`,
			};
		}

		if (intent === "reset_simulator_rows") {
			// Soft reset: delete only source=simulator rows for current profile
			class ResetService extends BaseService {
				async reset() {
					const {
						data: { user },
					} = await this.supabase.auth.getUser();
					if (!user) throw new ApiError("Unauthorized", 401);

					const pid = user.id;

					// Matches for simulator transactions
					const { data: simTx } = await this.supabase
						.from(this.TRANSACTIONS_TABLE)
						.select("id")
						.eq("profile_id", pid)
						.eq("source", "simulator");

					const txIds = (simTx || []).map((t) => t.id);
					if (txIds.length) {
						await this.supabase.from(this.MATCHES_TABLE).delete().in("transaction_id", txIds);
						await this.supabase
							.from(this.ANNOTATIONS_TABLE)
							.delete()
							.eq("entity_type", "transaction")
							.in("entity_id", txIds);
					}

					await this.supabase
						.from(this.PENDING_ACTIONS_TABLE)
						.delete()
						.eq("profile_id", pid)
						.eq("status", "pending");

					await this.supabase
						.from(this.TRANSACTIONS_TABLE)
						.delete()
						.eq("profile_id", pid)
						.eq("source", "simulator");

					await this.supabase
						.from(this.INVOICES_TABLE)
						.delete()
						.eq("profile_id", pid)
						.eq("source", "simulator");

					return true;
				}
			}

			await new ResetService(request).reset();
			return {
				ok: true,
				message: "Simulator data cleared (seed/paypal rows kept)",
			};
		}

		return { ok: false, message: "Unknown action" };
	} catch (err: any) {
		return {
			ok: false,
			message: err.message || "Demo action failed",
		};
	}
}

// ============================================================
// UI
// ============================================================
export default function DemoPage() {
	const { stats } = useLoaderData<typeof loader>();
	const actionData = useActionData<typeof action>();
	const navigation = useNavigation();
	const busy = navigation.state === "submitting";

	useEffect(() => {
		if (!actionData) return;
		if (actionData.ok) toast.success(actionData.message);
		else toast.error(actionData.message);
	}, [actionData]);

	const scenarioList = Object.values(SCENARIOS);

	return (
		<div className="mx-auto max-w-6xl space-y-8 p-6">
			{/* Header */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="mb-1 flex items-center gap-2">
						<FlaskConical className="h-6 w-6 text-muted-foreground" />
						<h1 className="text-2xl font-bold tracking-tight md:text-3xl">Demo Controls</h1>
					</div>
					<p className="text-sm text-muted-foreground max-w-xl">
						Inject PayPal-shaped events with controlled amounts and emails so rules, matches,
						anomalies, and pending actions actually fire. Official PayPal “test webhooks” use
						fixed dummy data — use this page for the real demo path.
					</p>
				</div>
				<Badge variant="secondary" className="w-fit">
					source = simulator
				</Badge>
			</div>

			{/* Live stats */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
				{[
					{ label: "Transactions", value: stats.transactions },
					{ label: "Invoices", value: stats.invoices },
					{ label: "Matches", value: stats.matches },
					{ label: "Pending", value: stats.pendingActions },
					{ label: "Webhooks logged", value: stats.webhookEvents },
				].map((s) => (
					<Card key={s.label} className="shadow-sm">
						<CardContent className="p-4">
							<p className="text-xs text-muted-foreground">{s.label}</p>
							<p className="text-2xl font-semibold tabular-nums">{s.value}</p>
						</CardContent>
					</Card>
				))}
			</div>

			{/* System actions */}
			<Card className="shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base">System actions</CardTitle>
					<CardDescription>
						Overdue reminders, clock, and cleanup — independent of PayPal dashboard.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					<Form method="post">
						<input type="hidden" name="intent" value="overdue_check" />
						<Button type="submit" variant="secondary" disabled={busy} size="sm">
							<Clock className="mr-2 h-4 w-4" />
							Run overdue check
						</Button>
					</Form>
					<Form method="post">
						<input type="hidden" name="intent" value="advance_clock" />
						<Button type="submit" variant="secondary" disabled={busy} size="sm">
							<Clock className="mr-2 h-4 w-4" />
							Advance demo clock
						</Button>
					</Form>
					<Form method="post">
						<input type="hidden" name="intent" value="reset_simulator_rows" />
						<Button
							type="submit"
							variant="outline"
							disabled={busy}
							size="sm"
							className="text-rose-600"
						>
							<RotateCcw className="mr-2 h-4 w-4" />
							Clear simulator data
						</Button>
					</Form>
				</CardContent>
			</Card>

			{/* Scenarios */}
			<div>
				<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
					Simulate PayPal events
				</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					{scenarioList.map((s) => {
						const Icon = s.icon;
						return (
							<Card key={s.id} className="shadow-sm">
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between gap-2">
										<div className="flex items-center gap-2">
											<div className="rounded-md border bg-muted/50 p-2">
												<Icon className="h-4 w-4 text-muted-foreground" />
											</div>
											<div>
												<CardTitle className="text-base">{s.title}</CardTitle>
												<p className="text-[11px] font-mono text-muted-foreground mt-0.5">
													{s.eventType}
												</p>
											</div>
										</div>
									</div>
									<CardDescription className="text-xs leading-relaxed pt-1">
										{s.description}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<Form method="post">
										<input type="hidden" name="intent" value="simulate" />
										<input type="hidden" name="scenario" value={s.id} />
										<Button type="submit" className="w-full" size="sm" disabled={busy}>
											{busy ? "Running…" : "Simulate event"}
										</Button>
									</Form>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>

			{/* Suggested demo script */}
			<Card className="border-dashed shadow-none bg-muted/30">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Suggested live demo order</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground space-y-1.5">
					<ol className="list-decimal list-inside space-y-1">
						<li>
							<strong className="text-foreground">New invoice</strong> — creates invoice +
							client link
						</li>
						<li>
							<strong className="text-foreground">Exact match</strong> — rules create match,
							invoice → paid
						</li>
						<li>
							<strong className="text-foreground">Partial payment</strong> — partial / agent
							path
						</li>
						<li>
							<strong className="text-foreground">Duplicate</strong> — anomaly + pending refund
						</li>
						<li>
							<strong className="text-foreground">Advance clock → Overdue check</strong> —
							pending reminders on Approvals
						</li>
						<li>
							Open <strong className="text-foreground">Transactions</strong>,{" "}
							<strong className="text-foreground">Approvals</strong>, confirm audit trail
						</li>
					</ol>
				</CardContent>
			</Card>
		</div>
	);
}
