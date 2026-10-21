import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";

export default function BackButton({ href }: { href: string | { pathname: string } }) {
	return (
		<Link to={href} viewTransition prefetch="intent">
			<Button variant="outline" size="icon" className="size-8">
				<ArrowLeft className="h-4 w-4" />
			</Button>
		</Link>
	);
}
