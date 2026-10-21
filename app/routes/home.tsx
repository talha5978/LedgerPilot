import { AuthService } from "~/services/auth.service.server";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
	return [{ title: "New React Router App" }, { name: "description", content: "Welcome to React Router!" }];
}

export function loader({ request }: Route.LoaderArgs) {
	const auth = new AuthService(request);

	return auth.getUser();
}

export default function Home({ loaderData }: Route.ComponentProps) {
	return <div>{JSON.stringify(loaderData)}</div>;
}
