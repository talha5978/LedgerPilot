import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { AuditService } from "~/services/audit.service.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	ArrowLeft,
	ShieldCheck,
	Clock,
	User,
	Database,
	FileCode,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Fingerprint,
} from "lucide-react";

export async function loader({ request, params }: LoaderFunctionArgs) {
	const auditService = new AuditService(request);
	const logId = params.id as string;

	const result = await auditService.getLogById(logId);

	if (result.error) {
		throw new Response(result.error.message, { status: result.error.statusCode });
	}

	return { log: result.data };
}

export default function AuditDetailRoute() {
	const { log } = useLoaderData<typeof loader>();
	const navigate = useNavigate();

	const getResultBadge = (result: string) => {
		switch (result?.toLowerCase()) {
			case "success":
			case "approved":
				return (
					<Badge
						variant="secondary"
						className="gap-1.5 text-xs border-border/50 text-emerald-600 dark:text-emerald-400 px-3 py-1"
					>
						<CheckCircle2 className="w-3.5 h-3.5" /> {result}
					</Badge>
				);
			case "rejected":
			case "failed":
				return (
					<Badge
						variant="outline"
						className="gap-1.5 text-xs border-destructive/40 text-destructive bg-destructive/10 px-3 py-1"
					>
						<XCircle className="w-3.5 h-3.5" /> {result}
					</Badge>
				);
			default:
				return (
					<Badge variant="outline" className="gap-1.5 text-xs px-3 py-1">
						<AlertTriangle className="w-3.5 h-3.5" /> {result || "unknown"}
					</Badge>
				);
		}
	};

	return (
		<div className="container mx-auto p-6 max-w-4xl space-y-6">
			{/* Back Button & Navigation */}
			<div className="flex items-center justify-between">
				<Button
					variant="outline"
					size="sm"
					onClick={() => navigate("/audit")}
					className="gap-1.5 text-xs"
				>
					<ArrowLeft className="w-4 h-4" /> Back to Audit Logs
				</Button>
				<span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
					<Fingerprint className="w-3.5 h-3.5" /> ID: {log.id}
				</span>
			</div>

			{/* Main Detail Header Card */}
			<Card className="border-border/60 bg-card overflow-hidden">
				<CardHeader className="pb-4 pt-6 px-6 border-b border-border/40 bg-muted/20">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
						<div className="space-y-1">
							<span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
								Action Executed
							</span>
							<CardTitle className="text-xl font-mono tracking-tight text-primary">
								{log.action_type}
							</CardTitle>
						</div>
						<div>{getResultBadge(log.result ?? "")}</div>
					</div>
				</CardHeader>

				<CardContent className="p-6 space-y-6 text-sm">
					{/* Metadata Grid */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div className="bg-muted/30 p-3.5 rounded-xl border border-border/40 space-y-1">
							<span className="text-xs text-muted-foreground uppercase font-medium flex items-center gap-1">
								<Database className="w-3.5 h-3.5 text-primary" /> Target Entity
							</span>
							<p className="font-medium capitalize text-foreground">
								{log.entity_type || "N/A"}
							</p>
							{log.entity_id && (
								<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground block truncate">
									{log.entity_id}
								</code>
							)}
						</div>

						<div className="bg-muted/30 p-3.5 rounded-xl border border-border/40 space-y-1">
							<span className="text-xs text-muted-foreground uppercase font-medium flex items-center gap-1">
								<User className="w-3.5 h-3.5 text-primary" /> Performed By
							</span>
							<p className="font-medium capitalize text-foreground">
								{log.performed_by || "System Agent"}
							</p>
							<span className="text-xs text-muted-foreground block">Actor Type</span>
						</div>

						<div className="bg-muted/30 p-3.5 rounded-xl border border-border/40 space-y-1">
							<span className="text-xs text-muted-foreground uppercase font-medium flex items-center gap-1">
								<Clock className="w-3.5 h-3.5 text-primary" /> Timestamp
							</span>
							<p className="font-medium text-foreground text-xs">
								{new Date(log.created_at).toLocaleString()}
							</p>
							<span className="text-xs text-muted-foreground block font-mono">
								{log.created_at}
							</span>
						</div>
					</div>

					{/* Full Trace JSON Payload Section */}
					<div className="space-y-2 pt-2">
						<div className="flex items-center justify-between">
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
								<FileCode className="w-4 h-4 text-primary" /> Full Execution Trace & Metadata
								Details
							</h3>
							<span className="text-xs text-muted-foreground font-mono">JSON Format</span>
						</div>

						<div className="bg-muted/60 p-4 rounded-xl border border-border/50 overflow-x-auto">
							<pre className="text-xs font-mono text-foreground leading-relaxed">
								{JSON.stringify(log.details || log, null, 2)}
							</pre>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
