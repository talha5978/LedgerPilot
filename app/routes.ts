import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/dashboard.tsx"),
	route("login", "./routes/Auth/login.tsx"),
	route("logout", "./routes/Auth/logout.ts"),
] satisfies RouteConfig;
