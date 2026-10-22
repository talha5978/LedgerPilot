import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { ClientsService, type ClientWithStats } from "~/services/clients.service.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Users, Search, Mail, FileText, DollarSign, AlertCircle } from "lucide-react";

export const meta = () => {
	return [{ title: "Clients | LedgerPilot" }];
};

export async function loader({ request }: LoaderFunctionArgs) {
	const clientsService = new ClientsService(request);
	const result = await clientsService.listClients();

	if (result.error) {
		throw new Response(result.error.message, { status: result.error.status });
	}

	return { clients: result.data || [] };
}

export default function ClientsPage() {
	const { clients } = useLoaderData<typeof loader>();
	const [searchQuery, setSearchQuery] = useState("");

	const filteredClients = clients.filter((client: ClientWithStats) => {
		const query = searchQuery.toLowerCase();
		return client.name?.toLowerCase().includes(query) || client.email?.toLowerCase().includes(query);
	});

	const totalClients = clients.length;
	const totalBilledAll = clients.reduce((sum, c) => sum + c.total_billed, 0);
	const totalOutstandingAll = clients.reduce((sum, c) => sum + c.outstanding_balance, 0);

	return (
		<div className="container mx-auto p-6 max-w-6xl space-y-8">
			{/* Page Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
						Clients Directory <Users className="w-5 h-5 text-primary" />
					</h1>
					<p className="text-muted-foreground text-sm">
						Manage your client profiles, invoice history, and outstanding balances.
					</p>
				</div>

				{/* Global Summary Stats */}
				<div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
					<Badge variant="secondary" className="px-3 py-1.5 text-xs gap-1.5 border-border/50">
						<Users className="w-3.5 h-3.5 text-muted-foreground" />
						<span className="font-semibold text-foreground">{totalClients}</span> Clients
					</Badge>
					<Badge variant="secondary" className="px-3 py-1.5 text-xs gap-1.5 border-border/50">
						<DollarSign className="w-3.5 h-3.5 text-primary" />
						Billed:{" "}
						<span className="font-semibold text-foreground">${totalBilledAll.toFixed(2)}</span>
					</Badge>
					{totalOutstandingAll > 0 && (
						<Badge
							variant="outline"
							className="px-3 py-1.5 text-xs gap-1.5 border-destructive/40 text-destructive bg-destructive/10"
						>
							<AlertCircle className="w-3.5 h-3.5" />
							Due: <span className="font-semibold">${totalOutstandingAll.toFixed(2)}</span>
						</Badge>
					)}
				</div>
			</div>

			{/* Filter / Search Bar */}
			<div className="relative max-w-md">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input
					placeholder="Search by name, email, or company..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 text-xs sm:text-sm bg-card border-border/60 focus:border-border"
				/>
			</div>

			{/* Client List Grid */}
			{filteredClients.length === 0 ? (
				<Card className="text-center py-16 border-dashed border-2 border-border/60 bg-card/50 max-w-xl mx-auto">
					<CardContent className="space-y-3">
						<div className="w-12 h-12 rounded-full bg-accent/50 border border-border flex items-center justify-center mx-auto text-muted-foreground">
							<Users className="w-6 h-6" />
						</div>
						<h3 className="text-base font-semibold tracking-tight">No clients found</h3>
						<p className="text-xs text-muted-foreground max-w-sm mx-auto">
							{searchQuery
								? "No client matches your search filter."
								: "Client records created from PayPal invoices or incoming transactions will appear here."}
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
					{filteredClients.map((client: ClientWithStats) => (
						<Card
							key={client.id}
							className="border-border/60 bg-card hover:border-border hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
						>
							<div>
								{/* Card Header */}
								<CardHeader className="pb-3 pt-5 px-5 space-y-2">
									<div className="flex items-start justify-between gap-2">
										<div className="space-y-0.5 min-w-0">
											<CardTitle className="text-base font-semibold tracking-tight truncate">
												{client.name || "Unnamed Client"}
											</CardTitle>
										</div>
										<Badge
											variant={client.outstanding_balance > 0 ? "outline" : "secondary"}
											className={`text-[10px] shrink-0 uppercase ${client.outstanding_balance > 0 ? "border-destructive/40 text-destructive bg-destructive/10" : ""}`}
										>
											{client.outstanding_balance > 0 ? "Due Balance" : "Clear"}
										</Badge>
									</div>
								</CardHeader>

								{/* Card Content */}
								<CardContent className="space-y-3 text-xs px-5 pb-4">
									{/* Email row */}
									<div className="flex items-center gap-2 text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/30 truncate">
										<Mail className="w-3.5 h-3.5 text-primary shrink-0" />
										<span className="truncate font-mono">{client.email}</span>
									</div>

									{/* Financial Breakdown Grid */}
									<div className="grid grid-cols-2 gap-2 pt-1 text-xs">
										<div className="bg-muted/30 p-2.5 rounded-lg border border-border/30 space-y-0.5">
											<span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">
												Total Billed
											</span>
											<span className="text-sm font-semibold text-foreground">
												${client.total_billed.toFixed(2)}
											</span>
										</div>

										<div className="bg-muted/30 p-2.5 rounded-lg border border-border/30 space-y-0.5">
											<span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">
												Total Paid
											</span>
											<span className="text-sm font-semibold text-foreground">
												${client.total_paid.toFixed(2)}
											</span>
										</div>
									</div>

									{/* Invoices summary line */}
									<div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
										<span className="flex items-center gap-1">
											<FileText className="w-3.5 h-3.5" />
											Invoices Count:
										</span>
										<span className="font-medium text-foreground">
											{client.total_invoices}
										</span>
									</div>
								</CardContent>
							</div>

							{/* Card Footer */}
							<div className="px-5 py-2.5 bg-muted/20 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
								<span>Client ID</span>
								<code className="font-mono text-foreground bg-muted px-1.5 py-0.5 rounded">
									{client.id.slice(0, 8)}...
								</code>
							</div>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
