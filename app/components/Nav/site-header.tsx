import { useLoaderData } from "react-router";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { SidebarTrigger } from "~/components/ui/sidebar";

export function SiteHeader() {
	const l = useLoaderData();
	const user = l?.profile;

	const initials = (user?.full_name || user?.email || "")
		.split(" ")
		.map((n: any) => n[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
	console.log(user, l);

	return (
		<header className="flex h-(--header-spacing) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-spacing)">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1 cursor-pointer" />
				<div className="ml-auto flex items-center gap-2">
					<Avatar className="size-8">
						<AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
					</Avatar>
				</div>
			</div>
		</header>
	);
}
