import {jsx} from "@b9g/crank/jsx-tag";
import {type Element} from "@b9g/crank";
import {renderer} from "@b9g/crank/html";
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import keycapsClient from "./clients/keycaps-client.ts" with {assetBase: "/assets/"};
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import downloadClient from "./clients/download-client.ts" with {assetBase: "/assets/"};

// The shared server shell — the one place doctype/head/meta/title/styles live. A
// page renders <${Layout}> around its own <main> and trailing islands.

const SITE = "https://ipabet.org";

/** The one description, everywhere. */
const TAGLINE = "A fast and memorable keyboard for typing the International Phonetic Alphabet.";

export interface LayoutProps {
	title: string;
	desc: string;
	/** Hashed stylesheet URLs to <link> (the preferred path — real .css assets). */
	styles?: string[];
	/** This page's path, for the canonical URL and the social card. */
	path?: string;
	children?: unknown;
}

export function Layout({title, desc, styles = [], path = "/", children}: LayoutProps) {
	const url = SITE + (path === "/" ? "" : path);
	// A search engine reads one page and has to place it: what this is, who
	// made it, what it costs. The JSON-LD says so outright instead of leaving
	// it to be inferred from prose.
	const schema = JSON.stringify({
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "IPAbet",
		description: TAGLINE,
		applicationCategory: "UtilitiesApplication",
		applicationSubCategory: "Keyboard",
		operatingSystem: "macOS, Windows, Linux",
		url: SITE,
		downloadUrl: SITE + "/download",
		softwareVersion: "0.1.2",
		license: "https://opensource.org/licenses/MIT",
		isAccessibleForFree: true,
		offers: {"@type": "Offer", price: "0", priceCurrency: "USD"},
		author: {"@type": "Person", name: "Brian Kim"},
	});

	return jsx`
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>${title}</title>
				<meta name="description" content=${desc} />
				<link rel="canonical" href=${url} />

				<meta property="og:type" content="website" />
				<meta property="og:site_name" content="IPAbet" />
				<meta property="og:title" content=${title} />
				<meta property="og:description" content=${desc} />
				<meta property="og:url" content=${url} />
				<meta name="twitter:card" content="summary" />
				<meta name="twitter:title" content=${title} />
				<meta name="twitter:description" content=${desc} />

				<script type="application/ld+json">${schema}</script>
				${styles.map((href) => jsx`<link rel="stylesheet" href=${href} />`)}
			</head>
			<body>
				${children}
				<script type="module" src=${keycapsClient}></script>
				<script type="module" src=${downloadClient}></script>
			</body>
		</html>`;
}

/** Render a page component to a full HTML Response. The doctype is prepended
 *  because the jsx tag can't parse `<!` inside a template. */
export function page(node: Element): Response {
	return new Response("<!DOCTYPE html>" + renderer.render(node), {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			// Serve from browser cache for 5 minutes, then revalidate in the
			// background for a day — a deploy reaches returning visitors within
			// one navigation after the max-age lapses.
			"Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
		},
	});
}
