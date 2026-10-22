import type { ActionFunctionArgs } from "react-router";
import { IngestService } from "~/services/ingest.service.server";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	try {
		const body = await request.json();
		const headers = Object.fromEntries(request.headers.entries());

		const ingestService = new IngestService(request);
		const result = await ingestService.processWebhook({ headers, body });

		return Response.json(result);
	} catch (err: any) {
		console.error("[paypal.webhook]", err);
		return Response.json(
			{ error: err.message || "Failed to process webhook" },
			{ status: err.statusCode || 500 },
		);
	}
}
