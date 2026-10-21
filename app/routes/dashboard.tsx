import { type LoaderFunctionArgs } from "react-router";

export async function loader({}: LoaderFunctionArgs) {
	return null;
}

export const meta = () => {
	return [
		{
			title: "Dashboard | LedgerPilot",
		},
	];
};

export default function DashboardHome() {
	return <></>;
}
