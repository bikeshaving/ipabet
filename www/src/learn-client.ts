// /learn client — walks the fixed, hand-designed course (curriculum.ts) lesson
// by lesson: each lesson introduces one new sound (keys shown, its phoneme
// plays) and drills a set of real words in order, mixing the new sound with
// ones learned earlier. Keystrokes run the real IPAbet engine (@b9g/ipabet).

import {
	handleKey,
	handleBackspace,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../js/src/index.ts";

interface Word { word: string; gloss: string; target: string; labels: string[]; }
interface Lesson { title: string; sound?: string; keys?: string[]; intro: string; audio?: string; words: Word[]; }
declare global { interface Window { __CURRICULUM: Lesson[]; } }

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const LESSONS = window.__CURRICULUM;

// ---------------------------------------------------------------- state
const KEY = "ipabet-learn-course-v1";
let li = 0, wi = 0, buffer = "", misses = 0, streak = 0, hinted = false;
try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s.li === "number") li = Math.min(Math.max(s.li, 0), LESSONS.length - 1); } catch { /* no storage */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify({li})); } catch { /* ignore */ } }
const lesson = () => LESSONS[li];
const word = () => lesson().words[wi];

// ---------------------------------------------------------------- sound
let curAudio: HTMLAudioElement | null = null;
function playSound() {
	const url = lesson().audio;
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

// ---------------------------------------------------------------- render
function renderHint() {
	const show = hinted || misses >= 2;
	$("#hint").innerHTML = show
		? word().labels.map((l) => `<kbd>${l}</kbd>`).join("")
		: `<button id="hintbtn">show keys</button>`;
	const btn = document.querySelector("#hintbtn");
	if (btn) btn.addEventListener("click", () => { hinted = true; renderHint(); });
}
function render() {
	const les = lesson();
	$("#stage").innerHTML = `Lesson ${li + 1} / ${LESSONS.length} — ${les.title}`
		+ (les.sound ? ` &middot; <span style="color:var(--accent)">new sound ${les.sound}${les.keys ? " (" + les.keys.join(" ") + ")" : ""}</span>` : "");
	$("#note").textContent = les.intro;
	$("#prog").textContent = `word ${wi + 1} / ${les.words.length}` + (wi === 0 && les.sound ? " · keys shown" : "");
	$("#target").textContent = word().target;
	$("#target").style.cursor = les.audio ? "pointer" : "default";
	$("#target").title = les.audio ? "play the new sound" : "";
	$("#word").innerHTML = `<b>${word().word}</b>${word().gloss ? ` — ${word().gloss}` : ""}`;
	$("#typed").textContent = buffer;
	$("#streak").textContent = streak > 2 ? `${streak} in a row` : "";
	renderHint();
	highlightKeyboard();
}
function goWord(newLesson: boolean) {
	buffer = ""; misses = 0;
	hinted = wi === 0;            // first word of a lesson (the demo) shows its keys
	render();
	if (newLesson) playSound();
}
function next() {
	streak = misses === 0 && !hinted ? streak + 1 : 0;
	wi += 1;
	if (wi < lesson().words.length) { goWord(false); return; }
	wi = 0;
	if (li < LESSONS.length - 1) { li += 1; save(); }  // advance a lesson (else linger on the last for practice)
	goWord(true);
}
function check() {
	if (buffer.normalize("NFC") === word().target.normalize("NFC")) {
		$("#typed").classList.add("good");
		setTimeout(() => { $("#typed").classList.remove("good"); next(); }, 350);
	} else if ([...buffer].length >= [...word().target].length) {
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
	for (let i = 0; i < upto; i++) { const k = keystrokeFromLabel(labels[i]); b = applyEdit(b, handleKey(b, k), nativeChar(k)); }
	return b;
}
function nextKeystroke(): Keystroke | null {
	const labels = word().labels;
	for (let p = 0; p <= labels.length; p++)
		if (simulate(labels, p).normalize("NFC") === buffer.normalize("NFC")) return p < labels.length ? keystrokeFromLabel(labels[p]) : null;
	return labels.length ? keystrokeFromLabel(labels[0]) : null;
}
function tapChar(ch: string) { sendKey({key: ch, shift: shiftArmed, option: optArmed}); shiftArmed = false; optArmed = false; updateMods(); }
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
	document.querySelectorAll("#kbd .kb").forEach((b) => b.classList.toggle("hot", nk !== null && (b as HTMLElement).dataset.k === nk.key));
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
$("#target").addEventListener("click", playSound);
goWord(true);
