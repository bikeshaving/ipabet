// /learn client — one drill that walks the syllabus stage by stage. Each stage
// introduces its new glyphs, then the words that just became typeable; the pool
// grows as you climb. Keystrokes run the real IPAbet engine (@b9g/ipabet).

import {
	handleKey,
	handleBackspace,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../js/src/index.ts";

interface Drill { target: string; labels: string[]; word?: string; gloss?: string; lang?: string; note?: string; }
interface Stage { title: string; note: string; glyphs: Drill[]; words: Drill[]; }

declare global {
	interface Window { __STAGES: Stage[]; }
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const stages = window.__STAGES;

// Flatten into a single ordered course: each stage's new glyphs, then its words.
interface Item { si: number; kind: "glyph" | "word"; d: Drill; n: number; of: number; }
const items: Item[] = [];
stages.forEach((s, si) => {
	const list = [...s.glyphs.map((d) => ["glyph", d] as const), ...s.words.map((d) => ["word", d] as const)];
	list.forEach(([kind, d], j) => items.push({si, kind, d, n: j + 1, of: list.length}));
});

let ii = 0, buffer = "", misses = 0, streak = 0, hinted = false;
const cur = () => items[ii];

// ------------------------------------------------------------ keyboard IO
const CODE_KEYS: Record<string, string> = {
	Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
	Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
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

// ------------------------------------------------------------ render
function renderHint() {
	const show = hinted || misses >= 2;
	$("#hint").innerHTML = show
		? cur().d.labels.map((l) => `<kbd>${l}</kbd>`).join("")
		: `<button id="hintbtn">show keys</button>`;
	const btn = document.querySelector("#hintbtn");
	if (btn) btn.addEventListener("click", () => { hinted = true; renderHint(); });
}
function renderNav() {
	$("#stagenav").innerHTML = stages
		.map((s, si) => `<button data-si="${si}" class="${si === cur().si ? "on" : ""}">${s.title}</button>`)
		.join("");
	document.querySelectorAll("#stagenav button").forEach((b) =>
		b.addEventListener("click", () => jumpTo(Number((b as HTMLElement).dataset.si))));
}
function render() {
	const it = cur(), s = stages[it.si];
	$("#stage").textContent = `Stage ${it.si + 1} of ${stages.length} · ${s.title}`;
	$("#note").textContent = s.note;
	$("#prog").textContent = `${it.kind === "glyph" ? "new glyph" : "word"} ${it.n} / ${it.of}`;
	$("#target").textContent = it.d.target;
	if (it.d.word) {
		$("#word").innerHTML = `<b>${it.d.word}</b>${it.d.gloss ? ` — ${it.d.gloss}` : ""} · ${it.d.lang}`;
	} else {
		$("#word").textContent = it.d.note ?? "";
	}
	$("#typed").textContent = buffer;
	$("#streak").textContent = streak > 2 ? `${streak} in a row` : "";
	renderHint();
	renderNav();
}
function jumpTo(si: number) {
	const at = items.findIndex((it) => it.si === si);
	if (at >= 0) { ii = at; buffer = ""; misses = 0; hinted = false; streak = 0; render(); }
}
function advance() {
	streak = misses === 0 && !hinted ? streak + 1 : 0;
	buffer = ""; misses = 0; hinted = false;
	ii = (ii + 1) % items.length;
	render();
}
function check() {
	if (buffer.normalize("NFC") === cur().d.target.normalize("NFC")) {
		$("#typed").classList.add("good");
		setTimeout(() => { $("#typed").classList.remove("good"); advance(); }, 350);
	} else if ([...buffer].length >= [...cur().d.target].length) {
		misses += 1;
		$("#typed").classList.add("bad");
		setTimeout(() => $("#typed").classList.remove("bad"), 250);
		renderHint();
	}
}

// ------------------------------------------------------------ input
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
