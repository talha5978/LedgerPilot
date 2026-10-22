import { BaseService } from "~/services/base.server.service";
import { ApiError } from "~/utils/errors/ApiError";

export class AuditService extends BaseService {
	/**
	 * List all audit log entries for the active profile
	 */
	async listLogs() {
		try {
			const profileId = await this.resolveProfileId();

			const { data, error } = await this.supabase
				.from("audit_log")
				.select("*")
				.eq("profile_id", profileId)
				.order("created_at", { ascending: false });

			if (error) {
				return { data: null, error: new ApiError(error.message, 500, [error]) };
			}

			return { data: data || [], error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to fetch audit logs", 500),
			};
		}
	}

	/**
	 * Fetch a single audit log entry by ID with full trace metadata
	 */
	async getLogById(id: string) {
		try {
			const profileId = await this.resolveProfileId();

			const { data, error } = await this.supabase
				.from("audit_log")
				.select("*")
				.eq("id", id)
				.eq("profile_id", profileId)
				.single();

			if (error || !data) {
				return { data: null, error: new ApiError("Audit log entry not found", 404) };
			}

			return { data, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to fetch audit log detail", 500),
			};
		}
	}

	private async resolveProfileId(): Promise<string> {
		try {
			const {
				data: { user },
			} = await this.supabase.auth.getUser();
			if (user?.id) return user.id;
		} catch {
			// Server-to-server / unauthenticated fallback
		}

		const { data: profile } = await this.supabase.from("profiles").select("id").limit(1).maybeSingle();

		if (profile?.id) return profile.id;

		return "00000000-0000-0000-0000-000000000001";
	}
}
