// /learn client: typing drills running the real IPAbet engine (@b9g/ipabet)
// in the browser. The drill targets are computed server-side by the same
// engine, so what the tutor demands and what the keyboard produces can
// never disagree.

import {
	handleKey,
	handleBackspace,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../lib/src/index.ts";

interface Drill {
	target: string;
	labels: string[];
	word?: string;
}

interface Level {
	title: string;
	blurb: string;
	drills: Drill[];
}

declare global {
	interface Window {
		__LEVELS: Level[];
	}
}

const CODE_KEYS: Record<string, string> = {
	Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[",
	BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'",
	Comma: ",", Period: ".", Slash: "/",
};

function keyFromEvent(e: KeyboardEvent): Keystroke | null {
	let key: string | undefined;
	if (/^Key[A-Z]$/.test(e.code)) key = e.code[3].toLowerCase();
	else if (/^Digit[0-9]$/.test(e.code)) key = e.code[5];
	else key = CODE_KEYS[e.code];
	if (key === undefined) return null;
	return {key, shift: e.shiftKey, option: e.altKey};
}

const segmenter = new Intl.Segmenter();
function dropLastCluster(text: string): string {
	let last = "";
	for (const s of segmenter.segment(text)) last = s.segment;
	return text.slice(0, text.length - last.length);
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

const levels = window.__LEVELS;
let li = 0;
let di = 0;
let buffer = "";
let misses = 0;
let streak = 0;
let hinted = false;

function drill(): Drill {
	return levels[li].drills[di];
}

function renderHint() {
	const show = hinted || misses >= 2;
	$("#hint").innerHTML = show
		? drill().labels.map((l) => `<kbd>${l}</kbd>`).join("")
		: `<button id="hintbtn">show keys</button>`;
	const btn = document.querySelector("#hintbtn");
	if (btn) btn.addEventListener("click", () => { hinted = true; renderHint(); });
}

function render() {
	const lv = levels[li];
	const d = drill();
	$("#level").textContent = `${lv.title} — ${di + 1}/${lv.drills.length}`;
	$("#blurb").textContent = lv.blurb;
	$("#target").textContent = d.target;
	$("#word").textContent = d.word ? `“${d.word}”` : "";
	$("#typed").textContent = buffer;
	$("#streak").textContent = streak > 2 ? `${streak} in a row` : "";
	renderHint();
}

function advance() {
	streak += misses === 0 && !hinted ? 1 : 0;
	if (misses > 0 || hinted) streak = 0;
	buffer = "";
	misses = 0;
	hinted = false;
	di += 1;
	if (di >= levels[li].drills.length) {
		di = 0;
		li = (li + 1) % levels.length;
	}
	render();
}

function check() {
	if (buffer.normalize("NFC") === drill().target.normalize("NFC")) {
		$("#typed").classList.add("good");
		setTimeout(() => {
			$("#typed").classList.remove("good");
			advance();
		}, 350);
	} else if (buffer.length >= drill().target.length) {
		misses += 1;
		$("#typed").classList.add("bad");
		setTimeout(() => $("#typed").classList.remove("bad"), 250);
		renderHint();
	}
}

window.addEventListener("keydown", (e) => {
	if (e.metaKey || e.ctrlKey) return;
	if (e.key === "Backspace") {
		e.preventDefault();
		const edit = handleBackspace(buffer);
		buffer = edit.type === "pass" ? dropLastCluster(buffer) : applyEdit(buffer, edit);
		render();
		return;
	}
	const k = keyFromEvent(e);
	if (k === null) return;
	e.preventDefault();
	const edit = handleKey(buffer, k);
	buffer = applyEdit(buffer, edit, nativeChar(k));
	render();
	check();
});

render();
