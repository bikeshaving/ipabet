// Platform-aware keystroke labels — the DOM half, included by <Layout> on every
// page. Detects the platform (localStorage override wins) and rewrites keystroke
// text in the server-rendered HTML.

import {KEYMODE_EVENT, keyMode, pcKeys, setKeyMode, type KeyMode} from "./keycaps.ts";

const SELECTOR = "kbd, code, .k, .chip, .fine";
const ISLANDS = "#drill, #kbd, #demo";

// Originals live as an expando on each text node (works in SVG too), so
// toggling is lossless in both directions and re-application is idempotent.
interface KmText extends Text {
	__km?: string;
}

function apply(mode: KeyMode): void {
	document.documentElement.dataset.keymode = mode;
	for (const el of document.querySelectorAll(SELECTOR)) {
		if (el.closest(ISLANDS)) continue;
		const it = document.createNodeIterator(el, NodeFilter.SHOW_TEXT);
		for (let n = it.nextNode() as KmText | null; n; n = it.nextNode() as KmText | null) {
			const orig = (n.__km ??= n.data);
			const next = mode === "pc" ? pcKeys(orig) : orig;
			if (n.data !== next) n.data = next;
		}
	}
}

function pill(): void {
	if (document.getElementById("keymode-pill")) return;
	const b = document.createElement("button");
	b.id = "keymode-pill";
	b.title = "Keystroke labels — switch between Mac (⌥⇧) and PC (Alt+Shift) spellings";
	const label = () => {
		b.textContent = keyMode() === "mac" ? "keys: ⌥ mac" : "keys: Alt pc";
	};
	b.addEventListener("click", () => setKeyMode(keyMode() === "mac" ? "pc" : "mac"));
	label();
	window.addEventListener(KEYMODE_EVENT, () => {
		label();
		apply(keyMode());
	});
	const style = document.createElement("style");
	style.textContent =
		"#keymode-pill{position:fixed;right:.8rem;bottom:.8rem;z-index:99;" +
		"font:500 .72rem/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
		"padding:.5em .85em;border-radius:999px;cursor:pointer;" +
		"border:1px solid color-mix(in srgb, CanvasText 30%, transparent);" +
		"background:Canvas;color:CanvasText;opacity:.6}" +
		"#keymode-pill:hover,#keymode-pill:focus-visible{opacity:1}" +
		"@media print{#keymode-pill{display:none}}"; // a screen control, never ink
	document.head.append(style);
	document.body.append(b);
}

apply(keyMode());
pill();
