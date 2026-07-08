import {CSS} from "./style.ts";
// Shovel rewrites this import to a hashed URL string at build time.
// @ts-ignore
import editorClient from "./editor-client.ts" with {assetBase: "/assets/"};

// /type — a freeform IPA scratchpad. The real engine runs on every keystroke,
// so you can transcribe directly in the browser without installing the IME.

const EDITOR_CSS = `
#pad { display: flex; flex-direction: column; gap: .9rem; margin: 1.5rem 0; }
#ed {
	width: 100%; min-height: 48vh; resize: vertical;
	background: var(--card); color: var(--fg);
	border: 1px solid var(--line); border-radius: 14px; padding: 1.1rem 1.2rem;
	font-family: "Charis SIL","Doulos SIL","Times New Roman",serif;
	font-size: 1.5rem; line-height: 1.7; letter-spacing: .01em;
	outline: none; transition: border-color .15s;
}
#ed:focus { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
#ed::placeholder { color: var(--dim); opacity: .7; }
#bar2 { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
#bar2 .grow { flex: 1; }
#bar2 button {
	font: .82rem ui-monospace, Menlo, monospace; padding: .4rem .85rem;
	border-radius: 999px; border: 1px solid var(--line); background: var(--bg);
	color: var(--fg); cursor: pointer; transition: color .15s, border-color .15s, background .15s;
}
#bar2 button:hover { border-color: var(--accent); color: var(--accent); }
#chain { display: inline-flex; align-items: center; gap: .45rem; color: var(--dim); }
#chain .dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--line); transition: background .15s, box-shadow .15s; }
#chain[aria-pressed="true"] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
#chain[aria-pressed="true"] .dot { background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
#count { color: var(--dim); font: .78rem ui-monospace, Menlo, monospace; margin-left: .2rem; }
.tips { color: var(--dim); font-size: .9rem; line-height: 1.6; }
.tips kbd { font-size: .82rem; }
.tips .combo { white-space: nowrap; }
`;

export const EDITOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Type IPA — IPAbet scratchpad</title>
<meta name="description" content="A freeform IPA scratchpad: type the International Phonetic Alphabet directly in your browser with the real IPAbet engine — no install. Digraphs, diacritics, and the shifted number row, then copy the Unicode out.">
<style>${CSS}${EDITOR_CSS}</style>
</head>
<body>
<main>
	<header style="padding-bottom:1rem">
		<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/type</span></h1>
		<p class="tagline" style="font-size:1.05rem">A scratchpad. Type IPA right here.</p>
		<p class="trust">The real engine, in the browser — no install. <span class="combo"><kbd>s</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ʃ</b></span> Copy the Unicode out when you're done.</p>
	</header>

	<div id="pad">
		<textarea id="ed" spellcheck="false" autocapitalize="off" autocomplete="off"
			placeholder="Start typing… s⇧H → ʃ · ⇧5 → ə · a⌥; → aː · n⌥n → ñ"></textarea>
		<div id="bar2">
			<button id="chain" aria-pressed="true"><span class="dot"></span>Hold-shift chaining</button>
			<span id="count">0</span>
			<span class="grow"></span>
			<button id="clear">Clear</button>
			<button id="copy">Copy</button>
		</div>
		<p class="tips">
			Bare keys type plain US; the IPA lives on the shifted positions.
			<span class="combo"><kbd>⇧</kbd>+letter</span> transforms the segment before the cursor
			(<span class="combo"><kbd>t</kbd><kbd>⇧R</kbd><span class="arrow">→</span><b class="ipa">ʈ</b></span>),
			<span class="combo"><kbd>⇧</kbd>+number</span> gives the homeless glyphs
			(<span class="combo"><kbd>⇧2</kbd><span class="arrow">→</span><b class="ipa">ʔ</b></span>),
			<span class="combo"><kbd>⌥</kbd></span> adds diacritics
			(<span class="combo"><kbd>a</kbd><kbd>⌥;</kbd><span class="arrow">→</span><b class="ipa">aː</b></span>),
			and <span class="combo"><kbd>⌥⇧</kbd></span> escapes to raw US. With <b>hold-shift chaining</b> on,
			hold <kbd>⇧</kbd> across a run to keep typing IPA without re-tapping. The
			<a href="/chart">full chart</a> has every key.
		</p>
	</div>

	<footer>
		<a href="/">← IPAbet</a>
		<a href="/chart">The chart</a>
		<a href="/learn">Learn</a>
		<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
	</footer>
</main>
<script type="module" src="${editorClient}"></script>
</body>
</html>`;
