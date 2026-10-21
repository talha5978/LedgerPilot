import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [index("routes/home.tsx"), route("login", "./routes/Auth/login.tsx")] satisfies RouteConfig;
