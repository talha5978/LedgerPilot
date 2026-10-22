import { ApiError } from "~/utils/errors/ApiError";

export type GeminiResult<T> = {
	data: T | null;
	error: ApiError | null;
};

/**
 * Thin Gemini wrapper — fast model, low temperature, JSON answers.
 * Not for deep reasoning; only structured classification / matching hints.
 */
export class GeminiService {
	private readonly apiKey: string;
	private readonly model = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
	private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";

	constructor() {
		this.apiKey = process.env.GEMINI_API_KEY || "";
		if (!this.apiKey) {
			console.warn("[GeminiService] GEMINI_API_KEY is not set");
		}
	}

	/**
	 * Single-shot JSON completion. Keep prompts short; expect a JSON object back.
	 */
	async generateJson<T = unknown>(opts: {
		system: string;
		user: string;
		temperature?: number;
	}): Promise<GeminiResult<T>> {
		if (!this.apiKey) {
			return {
				data: null,
				error: new ApiError("GEMINI_API_KEY is not configured", 500),
			};
		}

		try {
			const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					systemInstruction: {
						parts: [{ text: opts.system }],
					},
					contents: [
						{
							role: "user",
							parts: [{ text: opts.user }],
						},
					],
					generationConfig: {
						temperature: opts.temperature ?? 0.1,
						maxOutputTokens: 1024,
						responseMimeType: "application/json",
					},
				}),
			});

			const json = await response.json();

			if (!response.ok) {
				const msg = json?.error?.message || json?.message || `Gemini HTTP ${response.status}`;
				return {
					data: null,
					error: new ApiError(msg, response.status, [json]),
				};
			}

			const text: string =
				json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";

			if (!text.trim()) {
				return {
					data: null,
					error: new ApiError("Gemini returned empty content", 502, [json]),
				};
			}

			let parsed: T;
			try {
				parsed = JSON.parse(text) as T;
			} catch {
				// Sometimes model wraps JSON in markdown fences
				const cleaned = text
					.replace(/^```json\s*/i, "")
					.replace(/^```\s*/i, "")
					.replace(/\s*```$/i, "")
					.trim();
				parsed = JSON.parse(cleaned) as T;
			}

			return { data: parsed, error: null };
		} catch (err: any) {
			return {
				data: null,
				error: new ApiError(err.message || "Gemini request failed", 500),
			};
		}
	}
}
