import {Router} from "@b9g/router";
import spec from "../../spec/ipabet.json";
import {CSS} from "./style.ts";
import {CHART_HTML} from "./chart.ts";
import {LEARN_HTML} from "./learn.ts";
import {LESSONS} from "./lessons.ts";
import {lessonHTML} from "./lesson-page.ts";
import {assets} from "@b9g/assets/middleware";

// ipabet.json is the single source of truth: every table on this page is
// generated from it, so the site cannot drift from the spec (the fate of
// the old web/ demo).

interface Letter {
	key: string;
	glyph: string;
	cp: string;
	name: string;
}

interface Mark {
	opt: string;
	mark: string;
	type: string;
	double?: string;
	name: string;
}

const letters = spec.letters as Letter[];
const modifiers = spec.modifiers as Record<string, string>;
const marks = spec.marks as Mark[];

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// ⇧ + number row: the IPA glyphs with no Latin home.
const shiftNumbers = letters.filter((l) => /^[0-9]$/.test(l.key));

// Digraph transforms, grouped by their modifier letter.
const digraphs = letters.filter((l) => l.key.length === 2);
const byModifier = new Map<string, Letter[]>();
for (const d of digraphs) {
	const mod = d.key[1];
	if (!byModifier.has(mod)) byModifier.set(mod, []);
	byModifier.get(mod)!.push(d);
}

function digraphRows(): string {
	return [...byModifier.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([mod, entries]) => {
			const examples = entries
				.slice(0, 6)
				.map(
					(e) =>
						`<span class="combo"><kbd>${esc(e.key[0])}</kbd><kbd>⇧${esc(mod)}</kbd><span class="arrow">→</span><b class="ipa">${esc(e.glyph)}</b></span>`,
				)
				.join(" ");
			return `<tr><td><kbd>⇧${esc(mod)}</kbd></td><td class="desc">${esc(modifiers[mod] ?? "")}</td><td class="examples">${examples}</td></tr>`;
		})
		.join("\n");
}

function shiftNumberCells(): string {
	return shiftNumbers
		.map(
			(l) =>
				`<span class="combo"><kbd>⇧${esc(l.key)}</kbd><span class="arrow">→</span><b class="ipa">${esc(l.glyph)}</b></span>`,
		)
		.join(" ");
}

function markRows(): string {
	return marks
		.map((m) => {
			const dbl = m.double
				? `<td class="ipa">${esc("◌" + m.double)}</td>`
				: `<td class="dim">—</td>`;
			const shown = m.type === "combining" ? "◌" + m.mark : m.mark;
			return `<tr><td><kbd>⌥${esc(m.opt)}</kbd></td><td class="ipa">${esc(shown)}</td>${dbl}<td class="desc">${esc(m.name.toLowerCase())}</td></tr>`;
		})
		.join("\n");
}

// The hero demo: real keystroke sequences from the notation, animated.
// Every sequence here is verified against ipabet.json.
const DEMO = [
	{word: "ship", steps: [["s", "s"], ["⇧H", "ʃ"], ["i", "ʃi"], ["⇧H", "ʃɪ"], ["p", "ʃɪp"]]},
	{word: "thing", steps: [["t", "t"], ["⇧H", "θ"], ["i", "θi"], ["⇧H", "θɪ"], ["n", "θɪn"], ["⇧G", "θɪŋ"]]},
	{word: "about", steps: [["⇧5", "ə"], ["b", "əb"], ["a", "əba"], ["u", "əbau"], ["⇧H", "əbaʊ"], ["t", "əbaʊt"]]},
	{word: "señor", steps: [["s", "s"], ["e", "se"], ["n", "sen"], ["⌥n", "señ"], ["o", "seño"], ["r", "señor"]]},
	{word: "click", steps: [["q", "q"], ["⇧C", "ǃ"], ["a", "ǃa"]]},
];

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IPAbet — type IPA at typing speed</title>
<meta name="description" content="IPAbet is a free, open-source macOS input method for typing IPA (International Phonetic Alphabet) at full typing speed, in every app. A normal US keyboard with the IPA chart on its shifted layers — no codes to memorize, no copy-paste.">
<style>${CSS}</style>
</head>
<body>
<main>
	<header>
		<h1>IPA<span class="ipa">bet</span></h1>
		<p class="tagline">Type IPA at typing speed.</p>
		<p class="trust">Free · open source · fully offline · a native macOS input method that works in every app</p>
	</header>

	<div id="demo" aria-hidden="true">
		<div class="keys"></div>
		<div class="out"><span class="text ipa"></span><span class="caret"></span></div>
		<div class="word"></div>
	</div>
	<p style="text-align:center;margin-top:-1rem"><a href="/learn">🔊 Try it yourself — transcribe what you hear, right in the browser →</a></p>

	<section>
		<h2>A normal keyboard, with the IPA one shift away</h2>
		<p>IPAbet is a <b>normal US keyboard</b>. Bare keys type plain US — letters,
		digits, punctuation, shortcuts, all untouched — so it's a flawless daily
		driver for prose, code, and the terminal. The IPA chart is layered onto the
		shifted positions: <span class="combo"><kbd>s</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ʃ</b></span>
		<span class="combo"><kbd>⇧5</kbd><span class="arrow">→</span><b class="ipa">ə</b></span>
		<span class="combo"><kbd>n</kbd><kbd>⌥n</kbd><span class="arrow">→</span><b class="ipa">ñ</b></span>
		— grounded in romanization conventions you already know, not codes to memorize.
		The <a href="/chart">full IPA chart, annotated with its keystrokes</a>, is one page away.</p>
		<div class="cards">
			<div class="card"><h3>Works in every app</h3><p>A real input method, not a website or palette: type IPA directly into Word, Praat, ELAN, LaTeX, Slack, your browser — at full speed, offline.</p></div>
			<div class="card"><h3>Nothing to memorize</h3><p>Digraphs follow pinyin/ITRANS-style romanization; diacritics sit on Apple's ABC&nbsp;Extended keys; the glyphs with no Latin letter live on the shifted number row.</p></div>
			<div class="card"><h3>Your keyboard stays yours</h3><p>Unshifted keys are 100% native US. Every key always emits something, and <kbd>⌥⇧</kbd> is a raw-US escape for anything the IPA layer claims.</p></div>
		</div>
	</section>

	<section>
		<h2>The layers</h2>
		<div class="tablewrap">
		<table>
			<tr><th>Layer</th><th>Meaning</th><th>Examples</th></tr>
			<tr><td><kbd>bare</kbd></td><td class="desc">plain US — IPA letters that are Latin letters type directly</td>
				<td class="examples"><span class="combo"><kbd>s</kbd><span class="arrow">→</span><b class="ipa">s</b></span> <span class="combo"><kbd>1</kbd><span class="arrow">→</span><b>1</b></span></td></tr>
			<tr><td><kbd>⇧</kbd> + number</td><td class="desc">the IPA glyphs with no Latin home</td>
				<td class="examples">${shiftNumberCells()}</td></tr>
			<tr><td><kbd>⇧</kbd> + letter</td><td class="desc">modify the previous segment</td>
				<td class="examples"><span class="combo"><kbd>s</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ʃ</b></span> <span class="combo"><kbd>t</kbd><kbd>⇧R</kbd><span class="arrow">→</span><b class="ipa">ʈ</b></span> <span class="combo"><kbd>n</kbd><kbd>⇧G</kbd><span class="arrow">→</span><b class="ipa">ŋ</b></span></td></tr>
			<tr><td><kbd>⌥</kbd></td><td class="desc">postfix diacritics &amp; suprasegmentals</td>
				<td class="examples"><span class="combo"><kbd>a</kbd><kbd>⌥e</kbd><span class="arrow">→</span><b class="ipa">á</b></span> <span class="combo"><kbd>a</kbd><kbd>⌥;</kbd><span class="arrow">→</span><b class="ipa">aː</b></span> <span class="combo"><kbd>h</kbd><kbd>⌥4</kbd><span class="arrow">→</span><b class="ipa">ʰ</b></span></td></tr>
			<tr><td><kbd>⌥⇧</kbd></td><td class="desc">raw US escape — the plain character an IPA layer claims</td>
				<td class="examples"><span class="combo"><kbd>⌥⇧2</kbd><span class="arrow">→</span><b>@</b></span> <span class="combo"><kbd>⌥⇧H</kbd><span class="arrow">→</span><b>H</b></span></td></tr>
		</table>
		</div>
	</section>

	<section>
		<h2>How does everyone else type IPA?</h2>
		<div class="tablewrap">
		<table class="compare">
			<tr><th></th><th>System-wide</th><th>Typing speed</th><th>Maintained</th></tr>
			<tr><td>Web pickers (typeit)</td><td class="no">no — copy-paste</td><td class="no">no — clicking</td><td class="yes">yes</td></tr>
			<tr><td>IPA Palette</td><td class="yes">yes</td><td class="no">no — clicking</td><td class="no">discontinued, Intel-only</td></tr>
			<tr><td>SIL Keyman</td><td class="yes">yes</td><td class="no">memorized codes</td><td class="yes">yes</td></tr>
			<tr><td>X-SAMPA keylayouts</td><td class="yes">yes</td><td class="no">X-SAMPA required</td><td class="no">unsigned, 2013–2020</td></tr>
			<tr><td>LaTeX TIPA / Praat codes</td><td class="no">app-locked</td><td class="no">escape codes</td><td class="yes">yes</td></tr>
			<tr><td><b>IPAbet</b></td><td class="yes">yes</td><td class="yes">yes — QWERTY muscle memory</td><td class="yes">yes</td></tr>
		</table>
		</div>
	</section>

	<section>
		<h2>The modifier letters</h2>
		<p>A capital letter right after a glyph transforms it. Each modifier has one
		meaning, grounded in romanization tradition:</p>
		<div class="tablewrap">
		<table>
			<tr><th>Modifier</th><th>Meaning</th><th>Examples</th></tr>
			${digraphRows()}
		</table>
		</div>
	</section>

	<section>
		<h2>Diacritics — postfix, on the Option layer</h2>
		<p>Type the base, then decorate it: <span class="combo"><kbd>e</kbd><kbd>⌥e</kbd><span class="arrow">→</span><b class="ipa">é</b></span>.
		Key assignments follow Apple's ABC&nbsp;Extended layout where one exists and
		X-SAMPA/TIPA convention where it doesn't. Pressing a mark key twice yields
		the mark's <i>other form</i> (tilde above ↔ tilde below, acute ↔ double acute).</p>
		<div class="tablewrap">
		<table>
			<tr><th>Key</th><th>Mark</th><th>×2</th><th>Name</th></tr>
			${markRows()}
		</table>
		</div>
	</section>

	<section>
		<h2>Install</h2>
		<p>IPAbet is in active development ahead of its first signed release. To build
		from source today:</p>
		<ol class="install">
			<li>Clone <a href="https://github.com/bikeshaving/ipabet">github.com/bikeshaving/ipabet</a> and run <kbd>cd ime &amp;&amp; ./build.sh install</kbd></li>
			<li><b>Log out and back in</b> — macOS requires this once for new input methods; it's normal.</li>
			<li>System Settings → Keyboard → Input Sources → <kbd>+</kbd> → English → <b>IPA</b>.</li>
		</ol>
		<div class="note">A notarized installer package and Homebrew cask are coming
		with the first release — no Xcode, no logout surprises un-narrated.</div>
	</section>

	<section>
		<h2>FAQ</h2>
		<p><b>Does it mess with normal typing?</b> No — that's the design's first
		principle. Bare keys, digits, punctuation, and shortcuts are native US;
		tmux prefixes and vim counts pass straight through.</p>
		<p><b>Are the symbols real IPA codepoints?</b> Yes — IPAbet emits the true
		characters (ə U+0259, ǃ U+01C3, ː U+02D0), never lookalikes. Your
		transcriptions are searchable, fontable Unicode.</p>
		<p><b>What does it cover?</b> The full standard IPA chart — every consonant,
		vowel, click, diacritic, and suprasegmental. Not yet: Chao tone letters and extIPA.</p>
		<p><b>Privacy?</b> IPAbet is fully offline, makes no network connections, and
		is open source (MIT).</p>
	</section>

	<footer>
		<span>MIT © 2026 Brian Kim</span>
		<a href="/chart">The IPA chart in keystrokes</a>
		<a href="/learn">Learn to type it</a>
		<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
	</footer>
</main>
<script>
const DEMO = ${JSON.stringify(DEMO)};
const keysEl = document.querySelector("#demo .keys");
const outEl = document.querySelector("#demo .out .text");
const wordEl = document.querySelector("#demo .word");
let di = 0;
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function run() {
	for (;;) {
		const demo = DEMO[di % DEMO.length];
		di++;
		keysEl.innerHTML = demo.steps.map(([k]) => "<kbd>" + k + "</kbd>").join("");
		outEl.textContent = "";
		wordEl.textContent = "";
		await sleep(600);
		const kbds = keysEl.querySelectorAll("kbd");
		for (let i = 0; i < demo.steps.length; i++) {
			kbds[i].classList.add("hit");
			outEl.textContent = demo.steps[i][1];
			await sleep(380);
		}
		wordEl.textContent = "“" + demo.word + "”";
		await sleep(2200);
	}
}
run();
</script>
</body>
</html>`;

const router = new Router();
router.use(assets());

router.route("/").get(() => {
	return new Response(HTML, {
		headers: {"Content-Type": "text/html; charset=utf-8"},
	});
});

router.route("/chart").get(() => {
	return new Response(CHART_HTML, {
		headers: {"Content-Type": "text/html; charset=utf-8"},
	});
});

router.route("/learn").get(() => {
	return new Response(LEARN_HTML, {
		headers: {"Content-Type": "text/html; charset=utf-8"},
	});
});

router.route("/learn/:slug").get((_req, ctx) => {
	const lesson = LESSONS.find((l) => l.slug === ctx.params.slug);
	if (lesson === undefined) return new Response("Not found", {status: 404});
	return new Response(lessonHTML(lesson), {
		headers: {"Content-Type": "text/html; charset=utf-8"},
	});
});

self.addEventListener("fetch", (event) => {
	event.respondWith(router.handle(event.request));
});
