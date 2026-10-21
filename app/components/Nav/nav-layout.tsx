import { SiteHeader } from "~/components/Nav/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/Nav/app-sidebar";

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
	return (
		<SidebarProvider
			style={
				{
					"--sidebar-width": "calc(var(--spacing) * 72)",
					"--header-height": "calc(var(--spacing) * 12)",
				} as React.CSSProperties
			}
		>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader />
				<section className="flex flex-1 flex-col @container/main p-4">{children}</section>
			</SidebarInset>
		</SidebarProvider>
	);
}
