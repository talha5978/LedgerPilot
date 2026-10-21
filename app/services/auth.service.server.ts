import { BaseService } from "~/services/base.server.service";
import { ApiError } from "~/utils/errors/ApiError";
import type { User, Session } from "@supabase/supabase-js";
import { clearCachedProfile, getCachedProfile, setCachedProfile } from "~/utils/auth-cache.server";

type AuthResult<T> = {
	data: T | null;
	error: ApiError | null;
};

export class AuthService extends BaseService {
	/**
	 * Login with email + password
	 * This is the function you will call from the Login page action.
	 */
	async signInWithPassword({
		email,
		password,
	}: {
		email: string;
		password: string;
	}): Promise<AuthResult<{ user: User; session: Session }>> {
		try {
			const { data, error } = await this.supabase.auth.signInWithPassword({
				email,
				password,
			});

			if (error) {
				return {
					data: null,
					error: new ApiError(error.message, 401, [error]),
				};
			}

			if (!data.user || !data.session) {
				return {
					data: null,
					error: new ApiError("Login failed – no user or session returned", 401),
				};
			}

			return {
				data: { user: data.user, session: data.session },
				error: null,
			};
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to sign in", 500),
			};
		}
	}

	/**
	 * Get the currently authenticated user (or null)
	 */
	async getUser(): Promise<AuthResult<User>> {
		try {
			const {
				data: { user },
				error,
			} = await this.supabase.auth.getUser();

			if (error) {
				return {
					data: null,
					error: new ApiError(error.message, 401, [error]),
				};
			}

			return { data: user, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to get user", 500),
			};
		}
	}

	/**
	 * Require a user. Throws ApiError if not authenticated.
	 * Use this inside loaders/actions when the route must be protected.
	 */
	async requireUser(): Promise<User> {
		const { data: user, error } = await this.getUser();

		if (error || !user) {
			throw new ApiError("Unauthorized", 401);
		}

		return user;
	}

	/**
	 * Sign the user out
	 */
	async signOut(): Promise<AuthResult<boolean>> {
		try {
			const cookieHeader = this.request.headers.get("cookie");
			clearCachedProfile(cookieHeader);

			const { error } = await this.supabase.auth.signOut();

			if (error) {
				return {
					data: null,
					error: new ApiError(error.message, 400, [error]),
				};
			}

			return { data: true, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Failed to sign out", 500),
			};
		}
	}

	/**
	 * Get both the user and the profile in one call
	 */
	async getCurrentProfile() {
		// Extract the raw cookie header from the request to use as a cache key
		const cookieHeader = this.request.headers.get("cookie");

		// Check in-memory cache first (skips Supabase API entirely)
		const cached = getCachedProfile(cookieHeader);
		if (cached) {
			console.log("⚡ HIT AUTH/PROFILE CACHE");
			return { data: cached, error: null };
		}

		// console.log("🌸 RUNNING AUTH CHECK (Calling Supabase API)...");
		const { data: user, error: userError } = await this.getUser();

		if (userError || !user) {
			return {
				data: null,
				error: userError || new ApiError("Unauthorized", 401),
			};
		}

		const { data: profile, error: profileError } = await this.supabase
			.from(this.PROFILES_TABLE)
			.select("*")
			.eq("id", user.id)
			.single();

		if (profileError) {
			return {
				data: null,
				error: new ApiError(profileError.message, 500, [profileError]),
			};
		}

		const resultData = { user, profile };

		// Save into memory cache with a predictable TTL (e.g., 45 seconds)
		setCachedProfile(cookieHeader, resultData, 45);

		return {
			data: resultData,
			error: null,
		};
	}
}
