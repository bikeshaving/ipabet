import {typeKeys, type Keystroke} from "../../lib/src/index.ts";
import {CSS} from "./style.ts";
// Shovel's asset pipeline rewrites this import to a hashed URL string at
// build time; TypeScript sees the module itself, hence the ignore.
// @ts-ignore
import learnClient from "./learn-client.ts" with {assetBase: "/assets/"};

// /learn — typing drills. Drills are authored as KEYSTROKE SEQUENCES and
// their targets are computed here by running the real engine (typeKeys), so
// every drill is guaranteed typeable and every hint is guaranteed true.

// Compact notation: "s" bare, "+h" shift, "~n" option, "~+2" option-shift.
function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false, option = false, key = k;
		while (key[0] === "+" || key[0] === "~") {
			if (key[0] === "+") shift = true;
			else option = true;
			key = key.slice(1);
		}
		return {key, shift, option};
	});
}

function label(k: string): string {
	let shift = false, option = false, key = k;
	while (key[0] === "+" || key[0] === "~") {
		if (key[0] === "+") shift = true;
		else option = true;
		key = key.slice(1);
	}
	const mods = (option ? "⌥" : "") + (shift ? "⇧" : "");
	return mods + (shift && /[a-z]/.test(key) ? key.toUpperCase() : key);
}

function drill(word: string | undefined, ...keys: string[]) {
	return {
		target: typeKeys(seq(...keys)),
		labels: keys.map(label),
		word,
	};
}

const LEVELS = [
	{
		title: "Level 1 · The shifted number row",
		blurb: "The IPA glyphs with no Latin letter live on ⇧ + numbers.",
		drills: [
			drill(undefined, "+5"),
			drill(undefined, "+2"),
			drill(undefined, "+1"),
			drill(undefined, "+4"),
			drill(undefined, "+3"),
			drill(undefined, "+6"),
			drill(undefined, "+7"),
		],
	},
	{
		title: "Level 2 · Modifier transforms",
		blurb: "A ⇧letter right after a glyph transforms it: H lenites, R retroflexes, G goes dorsal, J palatalizes, W rounds.",
		drills: [
			drill(undefined, "s", "+h"),
			drill(undefined, "t", "+h"),
			drill(undefined, "z", "+h"),
			drill(undefined, "n", "+g"),
			drill(undefined, "t", "+r"),
			drill(undefined, "n", "+j"),
			drill(undefined, "i", "+h"),
			drill(undefined, "u", "+h"),
			drill(undefined, "e", "+h"),
			drill(undefined, "a", "+e"),
			drill(undefined, "q", "+c"),
		],
	},
	{
		title: "Level 3 · The Option layer",
		blurb: "Postfix diacritics: type the base, then ⌥+key decorates it. ⌥4 superscripts. R after a vowel adds rhoticity.",
		drills: [
			drill(undefined, "e", "~e"),
			drill(undefined, "a", "~n"),
			drill(undefined, "n", "~k"),
			drill(undefined, "a", "~;"),
			drill(undefined, "t", "h", "~4"),
			drill(undefined, "~'"),
			drill(undefined, "+5", "+r"),
			drill(undefined, "a", "~n", "~n"),
		],
	},
	{
		title: "Level 4 · Words",
		blurb: "Put it together — full transcriptions at typing speed.",
		drills: [
			drill("cat", "k", "a", "+e", "t"),
			drill("ship", "s", "+h", "i", "+h", "p"),
			drill("thing", "t", "+h", "i", "+h", "n", "+g"),
			drill("judge", "d", "z", "+h", "a", "+h", "d", "z", "+h"),
			drill("world", "w", "+5", "+h", "+r", "l", "d"),
			drill("about", "+5", "~'", "b", "a", "u", "+h", "t"),
			drill("phonetics", "f", "+5", "~'", "n", "e", "+h", "t", "i", "+h", "k", "s"),
			drill("señor (nasalized)", "s", "e", "n", "~n", "o", "r"),
		],
	},
];

export const LEARN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Learn IPAbet — typing drills</title>
<meta name="description" content="Interactive drills that teach you to type IPA at full speed with IPAbet. Runs the real input-method engine in your browser.">
<style>${CSS}
#drill {
	background: var(--card); border: 1px solid var(--line); border-radius: 12px;
	padding: 2rem 1.5rem; margin: 2rem 0; text-align: center;
}
#level { color: var(--dim); font-size: 0.9rem; }
#blurb { color: var(--dim); font-size: 0.95rem; height: 2.6rem; margin-top: 0.25rem; }
#target { font-size: 3rem; height: 4.4rem; line-height: 4.4rem; }
#word { color: var(--dim); height: 1.4rem; font-size: 0.95rem; }
#typed {
	font-size: 2.2rem; height: 3.4rem; line-height: 3.4rem; margin-top: 0.75rem;
	border-bottom: 2px solid var(--line); display: inline-block; min-width: 12rem;
	font-family: "Charis SIL", "Doulos SIL", "Times New Roman", serif;
}
#typed.good { border-color: #1a7f37; }
#typed.bad { border-color: #c43a3a; }
#hint { height: 2.4rem; margin-top: 1rem; }
#hint kbd { font-size: 0.95rem; margin: 0 0.15rem; }
#hint button {
	background: none; border: 1px solid var(--line); border-radius: 6px;
	color: var(--dim); padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.85rem;
}
#streak { color: var(--accent); height: 1.4rem; font-size: 0.9rem; margin-top: 0.5rem; }
.notice { color: var(--dim); font-size: 0.9rem; text-align: center; }
</style>
</head>
<body>
<main>
	<header>
		<h1><a href="/" style="text-decoration:none;color:inherit">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/learn</span></h1>
		<p class="tagline">Drills that run the real engine.</p>
		<p class="trust">Your keystrokes below are interpreted by the same code as the macOS input method — no install needed to practice.</p>
	</header>

	<div id="drill">
		<div id="level"></div>
		<div id="blurb"></div>
		<div id="target" class="ipa"></div>
		<div id="word"></div>
		<div><span id="typed"></span></div>
		<div id="hint"></div>
		<div id="streak"></div>
	</div>

	<p class="notice">Type what you see. <kbd>⇧</kbd> and <kbd>⌥</kbd> work like the real keyboard;
	backspace peels diacritics one mark at a time. Two misses reveal the keys.
	Hardware keyboard required — this is a typing tutor, after all.</p>

	<footer>
		<a href="/">← IPAbet</a>
		<a href="/chart">The chart</a>
		<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
	</footer>
</main>
<script>window.__LEVELS = ${JSON.stringify(LEVELS)};</script>
<script type="module" src="${learnClient}"></script>
</body>
</html>`;
