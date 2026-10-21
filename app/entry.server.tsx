import { PassThrough } from "node:stream";
import crypto from "node:crypto";
import type { EntryContext, RouterContextProvider } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";

export const streamTimeout = 5_000;

export default function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	_loadContext: RouterContextProvider,
) {
	const requestId = crypto.randomUUID();

	// https://httpwg.org/specs/rfc9110.html#HEAD
	if (request.method.toUpperCase() === "HEAD") {
		return new Response(null, {
			status: responseStatusCode,
			headers: responseHeaders,
		});
	}

	return new Promise((resolve, _) => {
		let shellRendered = false;
		let userAgent = request.headers.get("user-agent");

		let readyOption: keyof RenderToPipeableStreamOptions =
			(userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";

		let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
			() => abort(),
			streamTimeout + 1000,
		);

		const { pipe, abort } = renderToPipeableStream(
			<ServerRouter context={routerContext} url={request.url} />,
			{
				[readyOption]() {
					shellRendered = true;
					const body = new PassThrough({
						final(callback) {
							clearTimeout(timeoutId);
							timeoutId = undefined;
							callback();
						},
					});
					const stream = createReadableStreamFromReadable(body);

					responseHeaders.set("Content-Type", "text/html");

					pipe(body);

					resolve(
						new Response(stream, {
							headers: responseHeaders,
							status: responseStatusCode,
						}),
					);
				},
				onShellError(error: unknown) {
					console.error(`[SSR Critical Error] ID: ${requestId}`, error);

					// Graceful Fallback: Return a clean 500 HTML response instead of crashing
					responseStatusCode = 500;
					responseHeaders.set("Content-Type", "text/html");

					const fallbackHtml = `
						<!DOCTYPE html>
						<html lang="en">
						<head>
							<meta charset="UTF-8" />
							<title>Service Unavailable</title>
							<style>
							body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #f9f9f9; color: #333; }
							.container { max-width: 500px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
							h1 { color: #000; font-size: 24px; }
							p { color: #666; font-size: 14px; }
							.request-id { font-size: 12px; color: #aaa; margin-top: 20px; }
							</style>
						</head>
						<body>
							<div class="container">
							<h1>Something went wrong</h1>
							<p>We are experiencing temporary technical difficulties. Please try refreshing the page.</p>
							<div class="request-id">Request ID: ${requestId}</div>
							</div>
						</body>
						</html>
					`;

					resolve(
						new Response(fallbackHtml, {
							status: 500,
							headers: responseHeaders,
						}),
					);
				},
				onError(error: unknown) {
					responseStatusCode = 500;
					if (shellRendered) {
						console.error(error);
					}
				},
			},
		);
	});
}
