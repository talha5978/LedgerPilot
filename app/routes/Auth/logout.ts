import { AuthService } from "~/services/auth.service.server";
import type { Route } from "./+types/logout";

export const action = async ({ request }: Route.ActionArgs) => {
	const authService = new AuthService(request);
	const signedOut = await authService.signOut();
	if (signedOut.data) {
		return { ok: true };
	}

	return {
		ok: false,
		message: signedOut.error?.message,
	};
};
