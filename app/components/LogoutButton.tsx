import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useActionData, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";

export function LogoutButton() {
	const navigate = useNavigate();
	const actionData = useActionData();
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (actionData && !actionData.ok) {
			toast.error(actionData.message || "Something went wrong");
		}
	}, [actionData]);

	const onLogout = async () => {
		setIsLoading(true);

		const d = await fetch(window.location.origin + "/logout", {
			method: "POST",
			credentials: "include",
		});

		setIsLoading(false);

		if (!d.ok) {
			toast.error(actionData.message || "Something went wrong");
		} else {
			navigate("/login");
		}
	};

	return (
		<Button onClick={onLogout} size={"sm"}>
			{isLoading ? <Loader2 className="mr-2 animate-spin" /> : null} Logout
		</Button>
	);
}
