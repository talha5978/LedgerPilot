import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "~/lib/supabase/supabase.server";
import type { Database } from "~/types/database";

export class BaseService {
	protected supabase: SupabaseClient<Database>;
	readonly request: Request;
	readonly headers: Headers;

	protected readonly PROFILES_TABLE = "profiles";
	protected readonly TRANSACTIONS_TABLE = "transactions";
	protected readonly WEBHOOK_EVENTS_TABLE = "webhook_events";
	protected readonly PENDING_ACTIONS_TABLE = "pending_actions";
	protected readonly MATCHES_TABLE = "matches";
	protected readonly INVOICES_TABLE = "invoices";
	protected readonly CLIENTS_TABLE = "clients";
	protected readonly AUDIT_LOGS_TABLE = "audit_log";
	protected readonly ANNOTATIONS_TABLE = "annotations";

	constructor(request: Request) {
		const { supabase, headers } = createServerSupabaseClient(request);
		this.supabase = supabase;
		this.request = request;
		this.headers = headers;
	}
}
