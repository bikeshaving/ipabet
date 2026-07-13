import {Router} from "@b9g/router";
import {jsx} from "@b9g/crank/jsx-tag";
import {Landing} from "./landing.ts";
import {Chart, CHART_JSON} from "./chart.ts";
import {Learn} from "./learn.ts";
import {Keys, SPEC_JSON, SCHEMA_JSON} from "./keys.ts";
import {Design} from "./design.ts";
import {Type} from "./editor.ts";
import {page} from "./layout.ts";
import {assets} from "@b9g/assets/middleware";
import {isHTTPError} from "@b9g/http-errors";

// Secure-by-default. @b9g/router decides whether to render a full stack-trace
// debug page from `import.meta.env.MODE !== "production"` — so an *unset* MODE
// counts as dev. @b9g/platform-cloudflare does not define MODE at build time,
// so on Workers every 4xx/5xx would leak a stack trace. Force production unless
// a real mode is already set (local `shovel dev` keeps its stacks).
try {
	const meta = import.meta as unknown as {env?: Record<string, string>};
	meta.env ??= {};
	meta.env.MODE ??= "production";
} catch {
	// import.meta.env not writable on this platform — the boundary below covers it.
}

// Outermost error boundary: catch anything a handler (or the router's own
// no-match NotFound) throws, log the real error server-side for `wrangler
// tail`, and return a sanitized response. Never the framework debug page.
async function* errorBoundary(request: Request): AsyncGenerator<Request, Response | void, Response> {
	try {
		return yield request;
	} catch (error) {
		const status = isHTTPError(error) ? (error as {status: number}).status : 500;
		if (status >= 500) console.error("Unhandled error:", (error as Error)?.stack ?? error);
		const body = status < 500 ? ((error as Error)?.message || "Error") : "Internal Server Error";
		return new Response(body, {
			status,
			headers: {"Content-Type": "text/plain; charset=utf-8"},
		});
	}
}

const router = new Router();
router.use(errorBoundary);
router.use(assets());

router.route("/").get(() => page(jsx`<${Landing} />`));

router.route("/chart").get(() => page(jsx`<${Chart} />`));

router.route("/keys").get(() => page(jsx`<${Keys} />`));

router.route("/design").get(() => page(jsx`<${Design} />`));

router.route("/learn").get(() => page(jsx`<${Learn} />`));

router.route("/type").get(() => page(jsx`<${Type} />`));

router.route("/chart.json").get(() => {
	return new Response(CHART_JSON, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Access-Control-Allow-Origin": "*",
		},
	});
});

router.route("/ipabet.schema.json").get(() => {
	return new Response(SCHEMA_JSON, {
		headers: {
			"Content-Type": "application/schema+json; charset=utf-8",
			"Access-Control-Allow-Origin": "*",
		},
	});
});

router.route("/ipabet.json").get(() => {
	return new Response(SPEC_JSON, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Access-Control-Allow-Origin": "*",
		},
	});
});

self.addEventListener("fetch", (event) => {
	event.respondWith(router.handle(event.request));
});
