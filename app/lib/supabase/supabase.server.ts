import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

if (!supabaseUrl || !supabasePublishableKey) {
	throw new Error("Missing supabase environment variables.", {
		cause: {
			supabaseUrl: supabaseUrl,
			supabasePublishableKey: supabasePublishableKey,
			supabaseSecretKey: supabaseSecretKey ? "true" : "false",
		},
	});
}

/**
 * Creates a Supabase client scoped to the current user's request context.
 */
export function createServerSupabaseClient(request: Request) {
	const headers = new Headers();

	let supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
		cookies: {
			getAll() {
				return parseCookieHeader(request.headers.get("Cookie") ?? "");
			},
			setAll(cookiesToSet) {
				cookiesToSet.forEach(({ name, value, options }) => {
					headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
				});
			},
		},
	});

	return { supabase, headers };
}
