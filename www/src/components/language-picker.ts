import {jsx} from "@b9g/crank/standalone";
import type {Context} from "@b9g/crank/standalone";
import raw from "../gen/latin.json";
import type {Language} from "../latin-data.ts";
import {bindIPAInput, type IPABinding} from "../clients/ipa-input.ts";
import {displayKeys, KEYMODE_EVENT} from "../clients/keycaps.ts";

// /languages: pick a language, see every letter it needs beyond a–z with the
// keys that type it, and try them in a box running the real engine. Rendered
// on the server for French and hydrated by clients/languages.ts, which switches
// to the reader's own language when it is one of these.

const LANGS = raw.languages as Language[];
const FALLBACK = "French";
const IS_CLIENT = typeof window !== "undefined";

function browserLanguage(): Language | undefined {
	for (const tag of navigator.languages ?? [navigator.language]) {
		const code = tag.toLowerCase().split("-")[0];
		const hit = LANGS.find((l) => l.codes.includes(code));
		if (hit) return hit;
	}
	return undefined;
}

export function* LanguagePicker(this: Context) {
	let current = LANGS.find((l) => l.name === FALLBACK)!;
	let input: HTMLInputElement | undefined;
	let ipa: IPABinding | undefined;

	const choose = (l: Language) => this.refresh(() => {
		current = l;
		if (input) { input.value = ""; ipa?.reset(); }
	});

	const type = (glyph: string) => {
		if (!input || !ipa) return;
		const at = input.selectionStart ?? input.value.length;
		input.setRangeText(glyph, at, input.selectionEnd ?? at, "end");
		ipa.reset();
		input.focus();
	};

	if (IS_CLIENT) {
		this.schedule(() => {
			ipa = bindIPAInput(input!);
			const mine = browserLanguage();
			if (mine && mine !== current) choose(mine);
			window.addEventListener(KEYMODE_EVENT, () => this.refresh());
		});
	}

	for ({} of this) {
		const needsOption = current.letters.some((l) => l.capitalDigraphs);
		yield jsx`
			<div id="langs">
				<div class="lang-list" role="group" aria-label="Language">
					${LANGS.map((l) => jsx`
						<button type="button" aria-pressed=${l === current ? "true" : "false"} onclick=${() => choose(l)}>${l.name}</button>`)}
				</div>
				<h2 class="lang-name">${current.name}</h2>
				<ul class="lang-letters">
					${current.letters.map((l) => jsx`
						<li><button type="button" title=${"Type " + l.glyph} onclick=${() => type(l.glyph)}>
							<span class="g">${l.glyph}${l.capital ? " " + l.capital : ""}${l.capitalDigraphs ? jsx`<sup class="fn">*</sup>` : null}</span>
							<span class="k">${displayKeys(l.keys)}</span>
						</button></li>`)}
				</ul>
				${needsOption ? jsx`<p class="footnote"><sup class="fn">*</sup> Needs Capital Digraphs on, in the input menu.</p>` : null}
				<input id="lang-try" class="ipa" ref=${(el: HTMLInputElement) => (input = el)}
					spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"
					placeholder=${"Try it: type " + current.name + " here"} />
			</div>`;
	}
}
