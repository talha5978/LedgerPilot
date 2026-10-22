import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
	layout("./routes/dashboard_layout.tsx", [
		index("routes/dashboard.tsx"), // Home Dashboard
		route("transactions", "./routes/transactions.tsx"),
		route("transactions/:id", "./routes/transactions.$id.tsx"),
		route("invoices", "./routes/invoices.tsx"),
		route("invoices/:id", "./routes/invoices.$id.ts"),
		route("approvals", "./routes/approvals.tsx"),
		route("demo", "./routes/demo.tsx"),
		route("clients", "./routes/clients.tsx"),
		route("audit", "./routes/audit-logs.tsx"),
		route("audit/:id", "./routes/audit.$.tsx"),
	]),
	route("agent/run", "./routes/api.agent.run.ts"),
	route("webhooks/paypal", "./routes/webhooks.paypal.ts"),
	route("login", "./routes/Auth/login.tsx"),
	route("logout", "./routes/Auth/logout.ts"),
] satisfies RouteConfig;
