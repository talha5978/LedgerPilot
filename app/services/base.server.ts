import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "~/lib/supabase/supabase.server";
import type { Database } from "~/types/database";

export class BaseService {
	protected supabase: SupabaseClient<Database>;
	readonly request: Request;

	constructor(request: Request) {
		const supabase = createServerSupabaseClient(request);
		this.supabase = supabase;
		this.request = request;
	}
}
