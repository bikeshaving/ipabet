// Platform-aware keystroke labels — the DOM half, included by <Layout> on every
// page. Detects the visitor's platform (localStorage override wins), rewrites
// keystroke text in the server-rendered HTML, and offers a fixed corner pill to
// flip between Mac (⌥ ⇧ ⌃) and PC (AltGr+ Shift+ Ctrl+) spellings.
//
// Scope is deliberate: only elements that hold keystrokes — <kbd>, <code>, and
// the .k/.chip/.fine key chips — never prose. Crank-owned islands (#drill,
// #kbd, #demo) are skipped here; they translate at render time via keycaps.ts
// and re-render on KEYMODE_EVENT, so the two mechanisms never fight over a node.

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
	b.title = "Keystroke labels — switch between Mac (⌥⇧) and PC (AltGr+Shift) spellings";
	const label = () => {
		b.textContent = keyMode() === "mac" ? "keys: ⌥ mac" : "keys: AltGr pc";
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
		"#keymode-pill:hover,#keymode-pill:focus-visible{opacity:1}";
	document.head.append(style);
	document.body.append(b);
}

apply(keyMode());
pill();
