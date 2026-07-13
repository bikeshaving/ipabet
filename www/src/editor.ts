import {jsx} from "@b9g/crank/jsx-tag";
import {Layout} from "./layout.ts";
import {Combo} from "./components/ui.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import editorCss from "./styles/editor.css" with {assetBase: "/assets/"};
// @ts-ignore
import editorClient from "./editor-client.ts" with {assetBase: "/assets/"};

// /type — a freeform IPA scratchpad. The real engine runs on every keystroke,
// so you can transcribe directly in the browser without installing the IME.
// This page is authored as a Crank server component (rendered to a string in the
// worker); the interactive island stays vanilla — editor-client.ts attaches to
// the #ed / #pad DOM below exactly as before, so no framework ships to the client.

const DESC =
	"A freeform IPA scratchpad: type the International Phonetic Alphabet directly in your browser with the real IPAbet engine — no install. Digraphs, diacritics, and the shifted number row, then copy the Unicode out.";

export function Type() {
	return jsx`
		<${Layout} title="Type IPA — IPAbet scratchpad" desc=${DESC} styles=${[globalCss, editorCss]}>
			<main>
				<header style="padding-bottom:1rem">
					<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/type</span></h1>
					<p class="tagline" style="font-size:1.05rem">A scratchpad. Type IPA right here.</p>
					<p class="trust">The real engine, in the browser — no install. <${Combo} keys="s ⇧H" out="ʃ" /> Copy the Unicode out when you're done.</p>
				</header>

				<div id="pad">
					<textarea id="ed" spellcheck="false" autocapitalize="off" autocomplete="off"
						placeholder="Start typing… s⇧H → ʃ · ⇧5 → ə · a⌥; → aː · ⌥n n → ñ"></textarea>
					<div id="bar2">
						<span id="count">0</span>
						<span class="grow"></span>
						<button id="clear">Clear</button>
						<button id="copy">Copy</button>
					</div>
					<p class="tips">
						Bare keys type plain US; the IPA lives on the shifted positions.
						<span class="combo"><kbd>⇧</kbd>+letter</span> transforms the segment before the cursor
						(<${Combo} keys="t ⇧R" out="ʈ" />),
						<span class="combo"><kbd>⇧</kbd>+number</span> gives the homeless glyphs
						(<${Combo} keys="⇧2" out="ʔ" />),
						<span class="combo"><kbd>⌥</kbd></span> adds diacritics
						(<${Combo} keys="a ⌥;" out="aː" />),
						and <span class="combo"><kbd>⌥⇧</kbd></span> escapes to raw US. The
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
			<script type="module" src=${editorClient}></script>
		<//>`;
}
