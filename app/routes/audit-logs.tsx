import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { AuditService } from "~/services/audit.service.server";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import {
	ShieldCheck,
	Search,
	Clock,
	Activity,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	ChevronRight,
	User,
	Database,
} from "lucide-react";

export const meta = () => {
	return [{ title: "Audit Logs | LedgerPilot" }];
};

export async function loader({ request }: LoaderFunctionArgs) {
	const auditService = new AuditService(request);
	const result = await auditService.listLogs();

	if (result.error) {
		throw new Response(result.error.message, { status: result.error.statusCode });
	}

	return { logs: result.data || [] };
}

export default function AuditLogsPage() {
	const { logs } = useLoaderData<typeof loader>();
	const [searchQuery, setSearchQuery] = useState("");
	const navigate = useNavigate();

	const filteredLogs = logs.filter((log: any) => {
		const query = searchQuery.toLowerCase();
		return (
			log.action_type?.toLowerCase().includes(query) ||
			log.entity_type?.toLowerCase().includes(query) ||
			log.performed_by?.toLowerCase().includes(query) ||
			log.result?.toLowerCase().includes(query)
		);
	});

	const getResultBadge = (result: string) => {
		switch (result?.toLowerCase()) {
			case "success":
			case "approved":
				return (
					<Badge
						variant="secondary"
						className="gap-1 text-xs border-border/50 text-emerald-600 dark:text-emerald-400"
					>
						<CheckCircle2 className="w-3 h-3" /> {result}
					</Badge>
				);
			case "rejected":
			case "failed":
				return (
					<Badge
						variant="outline"
						className="gap-1 text-xs border-destructive/40 text-destructive bg-destructive/10"
					>
						<XCircle className="w-3 h-3" /> {result}
					</Badge>
				);
			default:
				return (
					<Badge variant="outline" className="gap-1 text-xs">
						<AlertTriangle className="w-3 h-3" /> {result || "unknown"}
					</Badge>
				);
		}
	};

	return (
		<div className="container mx-auto p-6 max-w-6xl space-y-8">
			{/* Page Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
						System Audit Logs <Activity className="w-5 h-5 text-primary" />
					</h1>
					<p className="text-muted-foreground text-sm">
						Immutable record of all agent proposals, approvals, rejections, and execution traces.
					</p>
				</div>
				<Badge variant="secondary" className="w-fit text-xs px-3 py-1 font-medium gap-1.5">
					<ShieldCheck className="w-3.5 h-3.5 text-primary" />
					{logs.length} Total Events Recorded
				</Badge>
			</div>

			{/* Search & Filter Toolbar */}
			<div className="relative max-w-md">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input
					placeholder="Filter by action type, entity, performer..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 text-xs sm:text-sm bg-card border-border/60 focus:border-border"
				/>
			</div>

			{/* Audit Logs Table Card */}
			<Card className="border-border/60 bg-card overflow-hidden">
				{filteredLogs.length === 0 ? (
					<div className="text-center py-16 space-y-3">
						<div className="w-12 h-12 rounded-full bg-accent/50 border border-border flex items-center justify-center mx-auto text-muted-foreground">
							<Activity className="w-6 h-6" />
						</div>
						<h3 className="text-base font-semibold tracking-tight">No audit records found</h3>
						<p className="text-xs text-muted-foreground max-w-sm mx-auto">
							{searchQuery
								? "No audit entries match your search filter."
								: "Actions performed by agents and users will appear here automatically."}
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-left border-collapse text-xs sm:text-sm">
							<thead>
								<tr className="border-b border-border/60 bg-muted/30 text-muted-foreground font-medium">
									<th className="py-3 px-4">Timestamp</th>
									<th className="py-3 px-4">Action Type</th>
									<th className="py-3 px-4">Entity</th>
									<th className="py-3 px-4">Performed By</th>
									<th className="py-3 px-4">Result</th>
									<th className="py-3 px-4 text-right">Details</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/40">
								{filteredLogs.map((log: any) => (
									<tr
										key={log.id}
										onClick={() => navigate(`/audit/${log.id}`)}
										className="hover:bg-muted/40 transition-colors cursor-pointer group"
									>
										<td className="py-3 px-4 text-muted-foreground font-mono text-xs whitespace-nowrap flex items-center gap-1.5">
											<Clock className="w-3.5 h-3.5" />
											{new Date(log.created_at).toLocaleString([], {
												month: "short",
												day: "numeric",
												hour: "2-digit",
												minute: "2-digit",
												second: "2-digit",
											})}
										</td>
										<td className="py-3 px-4 font-semibold text-foreground font-mono">
											{log.action_type}
										</td>
										<td className="py-3 px-4">
											<div className="flex items-center gap-1.5 text-muted-foreground">
												<Database className="w-3 h-3 text-primary" />
												<span className="capitalize">{log.entity_type || "N/A"}</span>
												{log.entity_id && (
													<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
														{log.entity_id.slice(0, 6)}...
													</code>
												)}
											</div>
										</td>
										<td className="py-3 px-4">
											<div className="flex items-center gap-1 text-muted-foreground">
												<User className="w-3 h-3" />
												<span className="capitalize">
													{log.performed_by || "system"}
												</span>
											</div>
										</td>
										<td className="py-3 px-4">{getResultBadge(log.result)}</td>
										<td className="py-3 px-4 text-right">
											<ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all inline-block" />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	);
}
