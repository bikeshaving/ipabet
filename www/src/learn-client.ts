// /learn client — a generative typing tutor. The bare letters you already
// touch-type are unlocked from the start; new sounds are introduced one at a
// time (with a real demonstration word), and the drill CONTINUOUSLY GENERATES
// fresh little words from the sounds you know — so you're always combining, not
// re-typing. Keystrokes run the real IPAbet engine (@b9g/ipabet).

import {
	handleKey,
	handleBackspace,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../js/src/index.ts";

interface GlyphInfo { g: string; kind: "V" | "C"; labels: string[]; audio?: string; obvious: boolean; note: string; }
interface Demo { word: string; target: string; labels: string[]; gloss?: string; lang?: string; }
interface Drill { target: string; labels: string[]; word?: string; gloss?: string; lang?: string; note?: string; audio?: string; intro?: boolean; focusG?: string; }

declare global {
	interface Window { __GLYPHS: GlyphInfo[]; __DEMO: Record<string, Demo>; }
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const GLYPHS = window.__GLYPHS;
const DEMO = window.__DEMO;

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

// ------------------------------------------------------------ learning state
const learnable = GLYPHS.filter((g) => !g.obvious);   // introduced one at a time
let Cs: GlyphInfo[] = [], Vs: GlyphInfo[] = [];        // unlocked sounds for generation
let nextLearn = 0;                                     // how many learnable sounds unlocked
let focus: GlyphInfo | null = null;                    // the sound currently being woven in
let mastered = 0, pendingDemo = false;                 // reps of focus done / show demo next
const NEED = 4;                                        // clean focus-words to master a sound

const KEY = "ipabet-learn-v2";
try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) nextLearn = s.n || 0; } catch { /* no storage */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify({n: nextLearn})); } catch { /* ignore */ } }

function rebuildUnlocked() {
	Cs = GLYPHS.filter((g) => g.obvious && g.kind === "C");
	Vs = GLYPHS.filter((g) => g.obvious && g.kind === "V");
	for (let i = 0; i < nextLearn; i++) (learnable[i].kind === "C" ? Cs : Vs).push(learnable[i]);
}
function setFocus() {
	if (nextLearn < learnable.length) { focus = learnable[nextLearn]; mastered = 0; pendingDemo = true; }
	else focus = null;
}
rebuildUnlocked();
setFocus();

let current: Drill;
let buffer = "", misses = 0, streak = 0, hinted = false, introducing = false;

// ------------------------------------------------------------ generation
const rand = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
function generate(): Drill {
	const syls = Math.random() < 0.5 ? 1 : 2;
	const parts: GlyphInfo[] = [];
	for (let s = 0; s < syls; s++) {
		if (Cs.length && Math.random() < 0.85) parts.push(rand(Cs)); // onset
		parts.push(rand(Vs));                                        // nucleus
		if (Cs.length && Math.random() < 0.30) parts.push(rand(Cs)); // coda
	}
	// weave in the sound being learned
	if (focus && !parts.some((p) => p.g === focus!.g)) {
		const slots = parts.map((p, i) => ({p, i})).filter((x) => x.p.kind === focus!.kind).map((x) => x.i);
		if (slots.length) parts[rand(slots)] = focus;
		else parts.push(focus);
	}
	const hasFocus = focus !== null && parts.some((p) => p.g === focus!.g);
	return {target: parts.map((p) => p.g).join(""), labels: parts.flatMap((p) => p.labels), focusG: hasFocus ? focus!.g : undefined};
}
function nextDrill(): Drill {
	if (focus && pendingDemo) {
		pendingDemo = false;
		const d = DEMO[focus.g];
		if (d) return {target: d.target, labels: d.labels, word: d.word, gloss: d.gloss, lang: d.lang, audio: focus.audio, intro: true, note: focus.note, focusG: focus.g};
		const g = generate(); g.intro = true; g.audio = focus.audio; g.note = focus.note; return g; // no demo word — introduce via a generated one
	}
	return generate();
}

// ------------------------------------------------------------ sound
let curAudio: HTMLAudioElement | null = null;
function playCurrent() {
	const url = current.audio;
	if (!url) return;
	if (curAudio) curAudio.pause();
	curAudio = new Audio(url);
	curAudio.play().catch(() => {}); // autoplay may be blocked pre-gesture; click replays
}

// ------------------------------------------------------------ render
const learnedCount = () => nextLearn;
function renderHint() {
	const show = hinted || misses >= 2;
	$("#hint").innerHTML = show
		? current.labels.map((l) => `<kbd>${l}</kbd>`).join("")
		: `<button id="hintbtn">show keys</button>`;
	const btn = document.querySelector("#hintbtn");
	if (btn) btn.addEventListener("click", () => { hinted = true; renderHint(); });
}
function render() {
	$("#stage").textContent = focus ? `New sound: ${focus.g}` : "Free play — every sound unlocked";
	$("#note").textContent = current.note ?? (focus ? focus.note : "");
	$("#prog").textContent = current.intro
		? "here’s the keys — then you’ll build with it"
		: (current.focusG ? `drilling ${current.focusG} · ${mastered}/${NEED}` : "fresh combination")
		+ ` · ${learnedCount()}/${learnable.length} sounds learned`;
	$("#target").textContent = current.target;
	$("#target").style.cursor = current.audio ? "pointer" : "default";
	$("#target").title = current.audio ? "play the sound" : "";
	if (current.word) $("#word").innerHTML = `<b>${current.word}</b>${current.gloss ? ` — ${current.gloss}` : ""} · ${current.lang}`;
	else $("#word").textContent = "";
	$("#typed").textContent = buffer;
	$("#streak").textContent = streak > 2 ? `${streak} in a row` : "";
	renderHint();
	highlightKeyboard();
}
function goto(d: Drill) {
	current = d; buffer = ""; misses = 0;
	introducing = d.intro === true;
	hinted = introducing;      // a newly-introduced sound shows its keys unprompted
	render();
	playCurrent();
}
function advance() {
	const clean = misses === 0 && !hinted;
	streak = clean ? streak + 1 : 0;
	if (focus && current.focusG === focus.g && !current.intro && clean) {
		mastered += 1;
		if (mastered >= NEED) { (focus.kind === "C" ? Cs : Vs).push(focus); nextLearn += 1; save(); setFocus(); }
	}
	goto(nextDrill());
}
function check() {
	if (buffer.normalize("NFC") === current.target.normalize("NFC")) {
		$("#typed").classList.add("good");
		setTimeout(() => { $("#typed").classList.remove("good"); advance(); }, 350);
	} else if ([...buffer].length >= [...current.target].length) {
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
const KB_ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];
let shiftArmed = false, optArmed = false;

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
function nextKeystroke(): Keystroke | null {
	const labels = current.labels;
	for (let p = 0; p <= labels.length; p++) {
		if (simulate(labels, p).normalize("NFC") === buffer.normalize("NFC"))
			return p < labels.length ? keystrokeFromLabel(labels[p]) : null;
	}
	return labels.length ? keystrokeFromLabel(labels[0]) : null;
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
		b.addEventListener("mousedown", (e) => e.preventDefault());
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
goto(nextDrill());
$("#target").addEventListener("click", playCurrent);