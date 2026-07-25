import {jsx} from "@b9g/crank/jsx-tag";
import {type Element} from "@b9g/crank";
import {renderer} from "@b9g/crank/html";
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import keycapsClient from "./clients/keycaps-client.ts" with {assetBase: "/assets/"};

// The shared server shell — the one place doctype/head/meta/title/styles live. A
// page renders <${Layout}> around its own <main> and trailing islands.

export interface LayoutProps {
	title: string;
	desc: string;
	/** Hashed stylesheet URLs to <link> (the preferred path — real .css assets). */
	styles?: string[];
	children?: unknown;
}

export function Layout({title, desc, styles = [], children}: LayoutProps) {
	return jsx`
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>${title}</title>
				<meta name="description" content=${desc} />
				${styles.map((href) => jsx`<link rel="stylesheet" href=${href} />`)}
			</head>
			<body>
				${children}
				<script type="module" src=${keycapsClient}></script>
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
