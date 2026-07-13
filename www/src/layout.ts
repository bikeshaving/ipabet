import {jsx} from "@b9g/crank/jsx-tag";
import {Raw, type Element} from "@b9g/crank";
import {renderer} from "@b9g/crank/html";

// The shared server shell — the one place doctype/head/meta/title/<style> live,
// instead of being re-typed at the top of every page. A page is a component that
// renders <${Layout}> around its own <main> and trailing island <script>s; the
// head stops being copy-paste. Server-only: the html renderer produces a string,
// so nothing here reaches the client (no page-weight cost — the whole point).

export interface LayoutProps {
	title: string;
	desc: string;
	/** Hashed stylesheet URLs to <link> (the preferred path — real .css assets). */
	styles?: string[];
	/** Legacy inline stylesheet text, injected raw. Retired page-by-page in favor
	 *  of `styles`; kept so not-yet-converted pages keep working mid-migration. */
	css?: string;
	children?: unknown;
}

export function Layout({title, desc, styles = [], css, children}: LayoutProps) {
	return jsx`
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>${title}</title>
				<meta name="description" content=${desc} />
				${styles.map((href) => jsx`<link rel="stylesheet" href=${href} />`)}
				${css === undefined ? null : jsx`<style><${Raw} value=${css} /></style>`}
			</head>
			<body>${children}</body>
		</html>`;
}

/** Render a page component to a full HTML Response. The doctype is prepended
 *  because the jsx tag can't parse `<!` inside a template. */
export function page(node: Element): Response {
	return new Response("<!DOCTYPE html>" + renderer.render(node), {
		headers: {"Content-Type": "text/html; charset=utf-8"},
	});
}
