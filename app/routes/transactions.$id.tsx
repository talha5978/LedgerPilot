import type { LoaderFunctionArgs } from "react-router";
import { TransactionService } from "~/services/transactions.service.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	if (!params.id) {
		throw new Response("Missing transaction ID", { status: 400 });
	}

	const service = new TransactionService(request);
	const { data, error } = await service.getById(params.id);

	if (error) {
		throw new Response(error.message, { status: error.statusCode });
	}

	return data;
}
