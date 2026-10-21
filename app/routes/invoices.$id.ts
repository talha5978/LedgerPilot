import type { LoaderFunctionArgs } from "react-router";
import { InvoiceService } from "~/services/invoices.service.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	if (!params.id) {
		throw new Response("Missing invoice ID", { status: 400 });
	}

	const service = new InvoiceService(request);
	const { data, error } = await service.getById(params.id!);

	if (error) {
		throw new Response(error.message, { status: error.statusCode || 500 });
	}

	return data;
}
