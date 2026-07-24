import {jsx} from "@b9g/crank/standalone";
import type {Context} from "@b9g/crank/standalone";
import {bindIPAInput, type IPABinding} from "../clients/ipa-input.ts";

// The /type scratchpad — one component, server-rendered and then hydrated by
// clients/type.ts. Every keystroke runs through the real engine relative to the
// caret, so mid-text editing, selection-replace and diacritic peeling behave as
// they do in the macOS IME.

const IS_CLIENT = typeof window !== "undefined";
const KEY = "ipabet-editor-v1";

export interface PadAPI {
	ipa: IPABinding;
	textarea: HTMLTextAreaElement;
}

export function* Pad(
	this: Context,
	{onchange, onready}: {onchange?: (pending: string) => void; onready?: (api: PadAPI) => void},
) {
	let ta: HTMLTextAreaElement | undefined;
	let count = 0;
	let pending = "";
	let copied = false;
	let ipa: IPABinding | undefined;

	const afterChange = (pendingText: string) => {
		this.refresh(() => {
			pending = pendingText;
			count = ta === undefined ? 0 : [...ta.value].length;
		});
		try { localStorage.setItem(KEY, JSON.stringify({text: ta!.value})); } catch { /* no storage */ }
		onchange?.(pendingText);
	};

	const oncopy = async () => {
		try {
			await navigator.clipboard.writeText(ta!.value);
			this.refresh(() => (copied = true));
			setTimeout(() => this.refresh(() => (copied = false)), 1200);
		} catch { /* clipboard blocked */ }
	};

	const onclear = () => {
		ta!.value = "";
		ipa!.reset();          // drop any armed accent with the text
		afterChange("");
		ta!.focus();
	};

	if (IS_CLIENT) {
		this.schedule(() => {
			try {
				const s = JSON.parse(localStorage.getItem(KEY) || "null");
				if (s && typeof s.text === "string") ta!.value = s.text;
			} catch { /* no storage */ }
			ipa = bindIPAInput(ta!, afterChange, () => {
				// The native IME took the field. Silence is the feature — the only
				// trace is the keys pill quietly telling the truth.
				const pill = document.getElementById("keymode-pill");
				if (pill !== null) {
					pill.textContent = "keys: native IME";
					pill.title = "The IPAbet input method is active — this page's own engine is off";
				}
			});
			afterChange(ipa.pendingText());
			ta!.focus();
			onready?.({ipa, textarea: ta!});
		});
	}

	for ({onchange, onready} of this) {
		yield jsx`
			<div id="pad">
				<textarea id="ed" ref=${(el: HTMLTextAreaElement) => (ta = el)}
					spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"
					placeholder="Type IPA…"></textarea>
				<div id="bar2">
					<span id="count">${count}</span>
					<span id="pending-mount">${
						pending === "" ? null : jsx`<span id="pending-chip">pending <span class="g">${"◌" + pending}</span></span>`
					}</span>
					<span class="grow"></span>
					<button id="clear" onclick=${onclear}>Clear</button>
					<button id="copy" onclick=${oncopy}>${copied ? "Copied" : "Copy"}</button>
				</div>
			</div>`;
	}
}
