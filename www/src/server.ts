import {Router} from "@b9g/router";
import {BlogIndex, BlogPost, findPost, atomFeed} from "./blog.ts";
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

// Secure-by-default. @b9g/router renders a stack-trace debug page whenever
// `import.meta.env.MODE !== "production"`, and @b9g/platform-cloudflare does not
// define MODE at build time — so on Workers every 4xx/5xx would leak a stack
// trace. Force production unless a real mode is already set.
try {
	const meta = import.meta as unknown as {env?: Record<string, string>};
	meta.env ??= {};
	meta.env.MODE ??= "production";
} catch {
	// import.meta.env not writable on this platform — the boundary below covers it.
}

// Outermost error boundary: log the real error server-side for `wrangler tail`
// and return a sanitized response. Never the framework debug page.
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

router.route("/blog").get(() => page(jsx`<${BlogIndex} />`));

router.route("/blog/:slug").get((_req: Request, context: {params: {slug: string}}) => {
	const post = findPost(context.params.slug);
	if (post === undefined) return new Response("not found", {status: 404});
	return page(jsx`<${BlogPost} post=${post} />`);
});

// The Atom feed — the planet contract: bikeshaving.org (and any feed reader)
// consumes this and nothing else.
router.route("/feed.xml").get(() => new Response(atomFeed(), {
	headers: {"Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=300"},
}));

// The download is one branded URL that outlives whatever hosts the binary.
// GitHub's /releases/latest/download/<name> always resolves to the newest
// published release, so this never needs touching either — but published prose
// points HERE, so the host can change without editing a dated blog post.
const RELEASE_PKG =
	"https://github.com/bikeshaving/ipabet/releases/latest/download/IPAbet.pkg";
router.route("/download").get(() => Response.redirect(RELEASE_PKG, 302));

router.route("/chart.json").get(() => {
	return new Response(CHART_JSON, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=300",
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
			"Cache-Control": "public, max-age=300",
			"Access-Control-Allow-Origin": "*",
		},
	});
});

self.addEventListener("fetch", (event) => {
	event.respondWith(router.handle(event.request));
});
