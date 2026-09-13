import {Router} from "@b9g/router";
import {BlogIndex, BlogPost, findPost, atomFeed} from "./blog.ts";
import {jsx} from "@b9g/crank/jsx-tag";
import {Landing} from "./landing.ts";
import {Chart, CHART_JSON} from "./chart.ts";
import {Learn} from "./learn.ts";
import {Keys} from "./keys.ts";
import {Design} from "./design.ts";
import {Type} from "./editor.ts";
import {page} from "./layout.ts";
import {posts} from "./content.ts";
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
	headers: {"Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"},
}));

// The downloads are branded URLs that outlive whatever hosts the binaries.
// GitHub's /releases/latest/download/<name> always resolves to the newest
// published release, so these never need touching either — but published prose
// points HERE, so the host can change without editing a dated blog post.
const RELEASE = "https://github.com/bikeshaving/ipabet/releases/latest/download";
const DOWNLOADS: Record<string, string> = {
	"/download/macos": `${RELEASE}/IPAbet.pkg`,
	"/download/windows": `${RELEASE}/IPAbet-x64.msi`,
	"/download/windows/arm64": `${RELEASE}/IPAbet-arm64.msi`,
	// The release attaches these under version-less names on purpose: a URL
	// with a version in it stops working the day the version changes, and
	// dpkg reads the version out of the package rather than off the name.
	"/download/linux": `${RELEASE}/ipabet-ibus-amd64.deb`,
	"/download/linux/arm64": `${RELEASE}/ipabet-ibus-arm64.deb`,
	"/download/linux/fcitx5": `${RELEASE}/ipabet-fcitx5-amd64.deb`,
};
for (const [path, url] of Object.entries(DOWNLOADS)) {
	router.route(path).get(() => Response.redirect(url, 302));
}

// /download sends you the build for the machine you asked from. Every existing
// link and published post points here, and this is the one place that can tell
// what you are running without the page having to guess.
//
// The sniff lives on the redirect and not in the HTML on purpose: pages are
// CDN-cached, and varying a cached page on User-Agent hands someone else's
// platform to whoever asks second.
function downloadFor(userAgent: string, chArch: string | null): string {
	if (/Windows NT/i.test(userAgent)) {
		// Chromium's frozen UA claims x64 even on ARM, so the architecture
		// only arrives in the Sec-CH-UA-Arch client hint (requested via
		// Critical-CH below, which makes Chromium retry with it before this
		// answer is used). The UA regex stays as the fallback for browsers
		// without client hints. An x64 build on ARM installs and then cannot
		// load into a native application.
		const arm = chArch !== null ? /arm/i.test(chArch) : /ARM64|aarch64/i.test(userAgent);
		return arm ? DOWNLOADS["/download/windows/arm64"] : DOWNLOADS["/download/windows"];
	}
	// Android reports Linux too, and there is nothing here to install on it.
	if (/Linux/i.test(userAgent) && !/Android/i.test(userAgent)) {
		return /aarch64|arm64/i.test(userAgent)
			? DOWNLOADS["/download/linux/arm64"]
			: DOWNLOADS["/download/linux"];
	}
	// macOS, iOS, and anything unrecognised: the Mac build is the one most
	// people asking are here for, and it is what /download has always meant.
	return DOWNLOADS["/download/macos"];
}

router.route("/download").get((request: Request) => {
	const target = downloadFor(
		request.headers.get("user-agent") ?? "",
		request.headers.get("sec-ch-ua-arch"),
	);
	// Never cached: the answer depends on who is asking. Critical-CH makes
	// Chromium restart the request carrying the architecture hint the first
	// time, so Windows-on-ARM machines get the arm64 build despite the
	// frozen UA; other browsers ignore these headers and take the UA path.
	return new Response(null, {
		status: 302,
		headers: {
			Location: target,
			"Cache-Control": "no-store",
			"Accept-CH": "Sec-CH-UA-Arch",
			"Critical-CH": "Sec-CH-UA-Arch",
			Vary: "Sec-CH-UA-Arch, User-Agent",
		},
	});
});

// Nothing here was findable by a crawler that had not already been sent a link:
// no sitemap, and no robots.txt to point at one.
const PAGES = [
	"/", "/chart", "/type", "/learn", "/keys", "/design", "/blog",
	...posts.filter((p) => p.attributes.draft !== true).map((p) => `/blog/${p.slug}`),
];

router.route("/sitemap.xml").get(() => {
	const xmlEscape = (s: string) =>
		s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	const urls = PAGES.map(
		(path) => `  <url><loc>${xmlEscape(`https://ipabet.org${path === "/" ? "" : path}`)}</loc></url>`,
	).join("\n");
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
			`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				"Cache-Control": "public, max-age=3600",
			},
		},
	);
});

router.route("/robots.txt").get(
	() =>
		new Response("User-agent: *\nAllow: /\nSitemap: https://ipabet.org/sitemap.xml\n", {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": "public, max-age=3600",
			},
		}),
);

router.route("/chart.json").get(() => {
	return new Response(CHART_JSON, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
			"Access-Control-Allow-Origin": "*",
		},
	});
});

self.addEventListener("fetch", (event) => {
	event.respondWith(router.handle(event.request));
});
