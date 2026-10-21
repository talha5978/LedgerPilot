import { redirect, Outlet, type LoaderFunctionArgs } from "react-router";
import { LogoutButton } from "~/components/LogoutButton";
import { AuthService } from "~/services/auth.service.server";

export async function loader({ request }: LoaderFunctionArgs) {
	const auth = new AuthService(request);

	try {
		const user = await auth.requireUser();
		const { data } = await auth.getCurrentProfile();

		return {
			user,
			profile: data?.profile ?? null,
		};
	} catch (error) {
		throw redirect("/login");
	}
}

export const meta = () => {
	return [
		{
			title: "Dashboard | LedgerPilot",
		},
	];
};

export default function DashboardLayout() {
	return (
		<div className="min-h-screen">
			<LogoutButton />
			{/* Your sidebar / header goes here later */}
			<Outlet />
		</div>
	);
}
