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

interface Drill { target: string; labels: string[]; word?: string; gloss?: string; lang?: string; note?: string; audio?: string; }
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

// ---------------------------------------------------- spaced repetition
// Leitner boxes, persisted: a clean recall promotes an item (longer wait),
// a stumble resets it to soon. New symbols are introduced in syllabus order
// only when reviews are caught up — progressive disclosure plus review.
const SRS_KEY = "ipabet-learn-srs-v1";
const INTERVALS = [2, 5, 13, 34, 89]; // steps until re-review, by box
const MAX_BOX = INTERVALS.length - 1;
interface Cell { box: number; due: number; seen: boolean; }
const idOf = (it: Item) => `${it.si}:${it.kind}:${it.d.target}`;
const srs: Cell[] = items.map(() => ({box: 0, due: 0, seen: false}));
let step = 0, introducing = false;
try {
	const saved = JSON.parse(localStorage.getItem(SRS_KEY) || "null");
	if (saved) {
		step = saved.step || 0;
		items.forEach((it, i) => { const s = saved.items?.[idOf(it)]; if (s) srs[i] = {box: s.b, due: s.d, seen: true}; });
	}
} catch { /* private mode / no storage — run stateless */ }
function save() {
	try {
		const out: Record<string, {b: number; d: number}> = {};
		items.forEach((it, i) => { if (srs[i].seen) out[idOf(it)] = {b: srs[i].box, d: srs[i].due}; });
		localStorage.setItem(SRS_KEY, JSON.stringify({step, items: out}));
	} catch { /* ignore */ }
}
function pick(): number {
	let best = -1, bestDue = Infinity;
	for (let i = 0; i < items.length; i++)
		if (srs[i].seen && srs[i].due <= step && srs[i].due < bestDue) { best = i; bestDue = srs[i].due; }
	if (best >= 0) return best;                                  // a review is due
	for (let i = 0; i < items.length; i++) if (!srs[i].seen) return i; // else introduce the next new symbol
	let si = 0, sd = Infinity;                                   // else the soonest-due
	for (let i = 0; i < items.length; i++) if (srs[i].due < sd) { sd = srs[i].due; si = i; }
	return si;
}
const learned = () => srs.filter((c) => c.box >= 2).length;
function goto(i: number) {
	ii = i;
	introducing = !srs[i].seen;
	if (introducing) srs[i].seen = true;
	hinted = introducing;      // first sight of a symbol: show the keys, unprompted
	buffer = ""; misses = 0;
	render();
	playCurrent();
}

// ------------------------------------------------------------ sound
// Real Wikimedia Commons phoneme recordings (self-hosted, attributed on
// /chart). Played when a glyph appears — you hear what you're typing.
let curAudio: HTMLAudioElement | null = null;
function playCurrent() {
	const url = cur().d.audio;
	if (!url) return;
	if (curAudio) curAudio.pause();
	curAudio = new Audio(url);
	curAudio.play().catch(() => {}); // autoplay may be blocked pre-gesture; click replays
}

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
	$("#prog").textContent = `${introducing ? "new symbol — keys shown" : "review"} · ${learned()} of ${items.length} learned`;
	$("#target").textContent = it.d.target;
	$("#target").style.cursor = it.d.audio ? "pointer" : "default";
	$("#target").title = it.d.audio ? "play the sound" : "";
	if (it.d.word) {
		$("#word").innerHTML = `<b>${it.d.word}</b>${it.d.gloss ? ` — ${it.d.gloss}` : ""} · ${it.d.lang}`;
	} else {
		$("#word").textContent = it.d.note ?? "";
	}
	$("#typed").textContent = buffer;
	$("#streak").textContent = streak > 2 ? `${streak} in a row` : "";
	renderHint();
	renderNav();
	highlightKeyboard();
}
function jumpTo(si: number) {
	const at = items.findIndex((it) => it.si === si);
	if (at >= 0) { streak = 0; goto(at); }
}
function advance() {
	const i = ii, clean = misses === 0 && !hinted;
	streak = clean ? streak + 1 : 0;
	srs[i].box = clean ? Math.min(srs[i].box + 1, MAX_BOX) : 0; // clean promotes, stumble resets
	srs[i].due = step + INTERVALS[srs[i].box];
	step += 1;
	save();
	goto(pick());
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

// ------------------------------------------------------------ input core
function doBackspace() {
	const edit = handleBackspace(buffer);
	buffer = edit.type === "pass" ? dropLastCluster(buffer) : applyEdit(buffer, edit);
	render();
}
function sendKey(k: Keystroke) {
	buffer = applyEdit(buffer, handleKey(buffer, k), nativeChar(k));
	render();
	check();
}

// -------------------------------------------------- on-screen keyboard
// A tapped keyboard so no hardware is needed (mobile too), and — the real
// payoff — it highlights the next key you need, like a proper typing tutor.
const KB_ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];
let shiftArmed = false, optArmed = false;

// Reconstruct a keystroke from a display label ("⇧H" → h+shift, "⌥e" → e+opt).
function keystrokeFromLabel(lab: string): Keystroke {
	const option = lab.includes("⌥");
	const shift = lab.includes("⇧");
	let key = lab.replace(/[⌥⇧]/g, "");
	if (key.length === 1 && /[A-Z]/.test(key)) key = key.toLowerCase();
	return {key, shift, option};
}
function simulate(labels: string[], upto: number): string {
	let b = "";
	for (let i = 0; i < upto; i++) {
		const k = keystrokeFromLabel(labels[i]);
		b = applyEdit(b, handleKey(b, k), nativeChar(k));
	}
	return b;
}
// Which keystroke comes next, given what's typed so far.
function nextKeystroke(): Keystroke | null {
	const labels = cur().d.labels;
	for (let p = 0; p <= labels.length; p++) {
		if (simulate(labels, p).normalize("NFC") === buffer.normalize("NFC"))
			return p < labels.length ? keystrokeFromLabel(labels[p]) : null;
	}
	return labels.length ? keystrokeFromLabel(labels[0]) : null; // diverged → back to start
}

function tapChar(ch: string) {
	sendKey({key: ch, shift: shiftArmed, option: optArmed});
	shiftArmed = false; optArmed = false; updateMods();
}
function updateMods() {
	document.querySelector("#kbd .mshift")?.classList.toggle("armed", shiftArmed);
	document.querySelector("#kbd .mopt")?.classList.toggle("armed", optArmed);
}
function buildKeyboard() {
	const kb = document.querySelector("#kbd");
	if (!kb) return;
	function cap(txt: string, cls: string, k: string, on: () => void): HTMLButtonElement {
		const b = document.createElement("button");
		b.textContent = txt; b.className = cls; if (k) b.dataset.k = k;
		b.addEventListener("mousedown", (e) => e.preventDefault()); // keep page focus
		b.addEventListener("click", (e) => { e.preventDefault(); on(); });
		return b;
	}
	function row(): HTMLDivElement { const r = document.createElement("div"); r.className = "kbrow"; kb!.appendChild(r); return r; }
	KB_ROWS.forEach((chars, ri) => {
		const r = row();
		if (ri === 3) r.appendChild(cap("⇧", "kb wide mshift", "", () => { shiftArmed = !shiftArmed; updateMods(); }));
		for (const ch of chars) r.appendChild(cap(ch, "kb", ch, () => tapChar(ch)));
		if (ri === 3) r.appendChild(cap("⌫", "kb wide", "", doBackspace));
	});
	const r = row();
	r.appendChild(cap("⌥", "kb wide mopt", "", () => { optArmed = !optArmed; updateMods(); }));
	r.appendChild(cap("space", "kb space", " ", () => tapChar(" ")));
}
function highlightKeyboard() {
	const nk = nextKeystroke();
	document.querySelectorAll("#kbd .kb").forEach((b) =>
		b.classList.toggle("hot", nk !== null && (b as HTMLElement).dataset.k === nk.key));
	document.querySelector("#kbd .mshift")?.classList.toggle("need", nk?.shift === true);
	document.querySelector("#kbd .mopt")?.classList.toggle("need", nk?.option === true);
}

// -------------------------------------------------------- physical keys
window.addEventListener("keydown", (e) => {
	if (e.metaKey || e.ctrlKey) return;
	if (e.key === "Backspace") { e.preventDefault(); doBackspace(); return; }
	const k = keyFromEvent(e);
	if (k === null) return;
	e.preventDefault();
	sendKey(k);
});

buildKeyboard();
$("#target").addEventListener("click", playCurrent);
goto(pick());
