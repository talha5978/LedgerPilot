import type { ActionFunctionArgs } from "react-router";
import { AgentService } from "~/services/agent.service.server";
import { ApiError } from "~/utils/errors/ApiError";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const body = await request.json();
		const { transactionId, runType } = body; // runType: 'transaction' | 'overdue_check'
		const agentService = new AgentService(request);

		if (runType === "transaction" && transactionId) {
			const result = await agentService.runForTransaction(transactionId);
			return Response.json(result);
		}

		if (runType === "overdue_check") {
			const result = await agentService.runOverdueCheck();
			return Response.json(result);
		}

		return Response.json({ error: "Invalid run type or missing parameters" }, { status: 400 });
	} catch (err: any) {
		const status = err instanceof ApiError ? err.statusCode : 500;
		return Response.json({ error: err.message || "Agent execution failed" }, { status });
	}
}
