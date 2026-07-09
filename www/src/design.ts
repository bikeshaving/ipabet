import {CSS} from "./style.ts";
import {CHART_CSS} from "./chart-style.ts";
import {AUDIO} from "./audio-map.ts";
// Shovel rewrites this import to a hashed URL string at build time.
// @ts-ignore
import chartViz from "./chart-viz.ts" with {assetBase: "/assets/"};

// /design — the reference explanation of the notation: the neutral definition
// plus the five constraints that determine nearly every assignment. Encyclopedic
// register on purpose (the landing does the pitch; the blog does the argument).
// Draft prose — meant to be hand-edited.

const EXTRA = `
.lede { font-size: 1.15rem; }
ol.constraints { list-style: none; margin: 1.5rem 0 0; counter-reset: c; }
ol.constraints > li {
	counter-increment: c; position: relative;
	padding: 1.1rem 0 1.1rem 2.6rem; border-top: 1px solid var(--line);
}
ol.constraints > li::before {
	content: counter(c); position: absolute; left: 0; top: 1.1rem;
	width: 1.7rem; height: 1.7rem; line-height: 1.7rem; text-align: center;
	font-family: ui-monospace, Menlo, monospace; font-size: 0.85rem;
	color: var(--dim); border: 1px solid var(--line); border-radius: 50%;
}
ol.constraints .name { font-weight: 600; }
ol.constraints .tag {
	display: inline-block; margin-left: 0.5rem; font-size: 0.68rem;
	letter-spacing: 0.06em; text-transform: uppercase; vertical-align: 0.1em;
	padding: 0.1rem 0.45rem; border-radius: 999px; border: 1px solid var(--kbd-line);
	color: var(--dim); background: var(--kbd-bg);
}
ol.constraints .tag.hard { color: var(--accent); border-color: var(--accent); }
ol.constraints .body { margin-top: 0.4rem; color: var(--dim); font-size: 0.95rem; }
ol.constraints .body .ipa, ol.constraints .body kbd { color: var(--fg); }
`;

export const DESIGN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The design of IPAbet</title>
<meta name="description" content="How IPAbet — the IPA keyboard for macOS — works, and the five constraints that shaped it: identity preservation, a two-character bound, local determinism, a phonetic operator algebra, and reuse of existing conventions.">
<style>${CSS}${EXTRA}${CHART_CSS}</style>
</head>
<body>
<main>
	<header style="padding-bottom:1rem">
		<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a></h1>
		<p class="tagline" style="font-size:1.1rem">The design</p>
	</header>

	<section style="margin-top:2rem">
		<p class="lede">IPAbet is an IPA keyboard for macOS — a system-wide input method that
		lets you type the International Phonetic Alphabet directly, at ordinary typing
		speed, in any application. Rather than replacing your keyboard layout, it adds the IPA to
		the standard US keyboard: unshifted keys type their normal characters, while
		the phonetic symbols live on the Shift and Option layers. Prose, code, and
		shortcuts type exactly as before; the IPA is one modifier key away.</p>
		<p>Where character pickers and escape schemes like
		<a href="https://en.wikipedia.org/wiki/X-SAMPA">X-SAMPA</a> convert a
		transliteration after the fact, IPAbet emits genuine Unicode as you type. The
		notation is compositional — most symbols are a base letter plus a single
		modifier, <span class="combo"><kbd>s</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ʃ</b></span>
		<span class="combo"><kbd>t</kbd><kbd>⇧R</kbd><span class="arrow">→</span><b class="ipa">ʈ</b></span>
		<span class="combo"><kbd>n</kbd><kbd>⇧G</kbd><span class="arrow">→</span><b class="ipa">ŋ</b></span>
		— and nearly every choice in it follows from five constraints.</p>
	</section>

	<section>
		<h2>Five constraints</h2>
		<ol class="constraints">
			<li>
				<span class="name">Identity preservation</span><span class="tag hard">hard</span>
				<div class="body">A Latin letter that is already an IPA symbol keeps its value, and
				unshifted keys stay native US: <kbd>s</kbd>→<span class="ipa">s</span>,
				<kbd>t</kbd>→<span class="ipa">t</span>, <kbd>m</kbd>→<span class="ipa">m</span>.
				The base layer needs no relearning, and every digraph is built on a base that
				genuinely <em>is</em> its Latin sound. The non-negotiable anchor.</div>
			</li>
			<li>
				<span class="name">Length bound — two characters</span><span class="tag hard">hard</span>
				<div class="body">No phonetic segment costs more than a base letter and at most
				one modifier: <span class="combo"><kbd>t</kbd><kbd>⇧R</kbd><span class="arrow">→</span><b class="ipa">ʈ</b></span>.
				(Diacritics are a separate postfix layer.) This bounds both the effort of any
				symbol and the amount of text the engine ever has to look at.</div>
			</li>
			<li>
				<span class="name">Local determinism</span><span class="tag hard">hard</span>
				<div class="body">Every segment is unambiguous and decidable from the characters
				right at the cursor — no lookahead, no backtracking, no global state — and the
				mapping is a lossless bijection, one keystroke sequence per glyph. This is the
				property that lets the input method be <em>stateless</em>: it commits each
				keystroke instantly and rewrites the character before the cursor, the way Korean
				input methods do, because it never has to remember anything.</div>
			</li>
			<li>
				<span class="name">Phonetic operator algebra</span><span class="tag">structural</span>
				<div class="body">The remaining symbols are generated by applying a small set of
				phonetically meaningful operators to bases, with open-ended rules preferred over
				lists. <kbd>⇧H</kbd> spirantizes — <span class="combo"><kbd>p</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ɸ</b></span>
				<span class="combo"><kbd>t</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">θ</b></span>
				<span class="combo"><kbd>c</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ç</b></span> —
				and <kbd>⇧R</kbd> retroflexes a coronal. Each operator is a real articulatory
				move, and each operator letter names its own feature, which is what makes the
				system a grammar you can read rather than a table you memorize. Voicing is not an
				operator; it rides the base letter (<kbd>s</kbd>/<kbd>z</kbd>).</div>
			</li>
			<li>
				<span class="name">Convention reuse</span><span class="tag">bias</span>
				<div class="body">Among encodings that satisfy the rest, prefer the one users already
				know: pinyin (<span class="combo"><kbd>s</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ʃ</b></span>
				<span class="combo"><kbd>n</kbd><kbd>⇧G</kbd><span class="arrow">→</span><b class="ipa">ŋ</b></span>),
				the <a href="https://en.wikipedia.org/wiki/Arabic_chat_alphabet">Arabic chat alphabet</a>
				(<span class="combo"><kbd>⇧2</kbd><span class="arrow">→</span><b class="ipa">ʔ</b></span>
				<span class="combo"><kbd>⇧7</kbd><span class="arrow">→</span><b class="ipa">ħ</b></span>),
				X-SAMPA (<span class="combo"><kbd>⇧4</kbd><span class="arrow">→</span><b class="ipa">ɾ</b></span>),
				and English spelling (<span class="combo"><kbd>w</kbd><kbd>⇧H</kbd><span class="arrow">→</span><b class="ipa">ʍ</b></span>,
				from <em>wh</em>). This keeps it guessable rather than idiosyncratic.</div>
			</li>
		</ol>
	</section>

	<section>
		<h2>How the constraints resolve</h2>
		<p>The five are ranked. The first three are hard — inviolable — and the last two
		settle the assignment within them, transformation before convention. Two things
		fall out of that order.</p>
		<p>The rough edges are <em>predicted</em>, not hidden. A sound more than one
		articulatory step from any Latin anchor cannot be reached in two keys, so the
		voiced palatal fricative <span class="ipa">ʝ</span> gets an approximate
		<span class="combo"><kbd>g</kbd><kbd>⇧J</kbd></span> rather than a clean derivation —
		the length bound binding against a sparse corner of the alphabet. The constraints
		account for the compromises, not just the wins.</p>
		<p>And the notation's cleverness and the engine's cleverness turn out to be the same
		fact seen twice. A system built from local, phonetically meaningful operators is
		exactly a system you can interpret one segment at a time — which is what makes the
		whole thing typeable at full speed with no composition buffer behind it.</p>
	</section>

	<section>
		<h2>The algebra, animated</h2>
		<p>The operator algebra is easiest to see in motion. Every vowel and every pulmonic
		consonant below sits at its true articulatory position; choose an operator to light up
		the arrows that <em>generate</em> the derived symbols from their bases — the same
		<kbd>⇧H</kbd>, <kbd>⇧R</kbd>, <kbd>⇧J</kbd> that you type. Drag the slider to morph the
		vowel quadrilateral into acoustic F1×F2 space, or the consonant grid into the vocal
		tract. Click any symbol to hear it.</p>
		<h3 style="margin:1.5rem 0 0;font-size:1rem">Vowels</h3>
		<div id="vowel-chart"></div>
		<h3 style="margin:1.5rem 0 0;font-size:1rem">Pulmonic consonants</h3>
		<div id="consonant-chart"></div>
	</section>

	<section>
		<h2>Coverage</h2>
		<p>IPAbet covers every symbol on the standard IPA chart — consonants, vowels,
		diacritics, suprasegmentals, pulmonic and non-pulmonic — with one deliberate
		omission: <span class="ipa">ɧ</span>, which has no stable articulation, so its
		variants are transcribed directly. extIPA is not yet covered.
		The full mapping is on <a href="/chart">the chart</a>, in
		<a href="/keys">machine-readable form</a>, and as
		<a href="/ipabet.json">raw JSON</a>.</p>
	</section>

	<footer>
		<a href="/">Home</a>
		<a href="/chart">Chart</a>
		<a href="/learn">Learn</a>
		<a href="/type">Scratchpad</a>
		<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
	</footer>
</main>
<script>window.__CHART_AUDIO = ${JSON.stringify(AUDIO)};</script>
<script type="module" src="${chartViz}"></script>
</body>
</html>`;
