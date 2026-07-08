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

interface Word { word: string; lang: string; gloss: string; target: string; labels: string[]; audio?: string; }
interface Lesson { title: string; sound?: string; keys?: string[]; intro: string; audio?: string; words: Word[]; }
declare global { interface Window { __CURRICULUM: Lesson[]; } }

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const LESSONS = window.__CURRICULUM;

// Prototype: hold shift to continue IPA (a shifted letter after a special glyph
// chains as a base). Additive — the taught bare-key paths still work identically,
// so the on-path check (which compares glyph output, not keystrokes) is unaffected.
const CHAIN = {shiftChain: true};

// ---------------------------------------------------------------- state
const KEY = "ipabet-learn-course-v1";
let li = 0, wi = 0, buffer = "", misses = 0, streak = 0, hinted = false;
let ear = false, shown = false; // ear-training: hide the target, type from sound; `shown` = revealed this word
try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s.li === "number") li = Math.min(Math.max(s.li, 0), LESSONS.length - 1); if (s && s.ear) ear = true; } catch { /* no storage */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify({li, ear})); } catch { /* ignore */ } }
const lesson = () => LESSONS[li];
const word = () => lesson().words[wi];

// ---------------------------------------------------------------- sound
let curAudio: HTMLAudioElement | null = null;
function play(url?: string) {
	if (!url) return;
	if (curAudio) curAudio.pause();
	curAudio = new Audio(url);
	curAudio.play().catch(() => {}); // autoplay may be blocked pre-gesture; click replays
	const say = document.querySelector("#say");
	if (say) { say.classList.remove("playing"); void (say as HTMLElement).offsetWidth; say.classList.add("playing"); }
}
const playSound = () => play(lesson().audio); // the lesson's isolated phoneme (Commons recording)
const playWord = () => play(word().audio);    // the current word, baked from its IPA (Polly)

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
	if (ear && !shown) { // ear mode: never spill the keys; offer a reveal escape instead
		$("#hint").innerHTML = `<button id="hintbtn">reveal answer</button>`;
		document.querySelector("#hintbtn")?.addEventListener("click", () => { shown = true; hinted = true; render(); });
		return;
	}
	const show = hinted || misses >= 2 || (ear && shown);
	$("#hint").innerHTML = show
		? word().labels.map((l) => `<kbd>${l}</kbd>`).join("")
		: `<button id="hintbtn">show keys</button>`;
	document.querySelector("#hintbtn")?.addEventListener("click", () => { hinted = true; renderHint(); });
}
function render() {
	const les = lesson();
	$("#stage").innerHTML = `Lesson ${li + 1} / ${LESSONS.length} — ${les.title}`
		+ (les.sound ? ` &middot; new sound <span class="g">/${les.sound}/</span>` + (les.keys ? " &nbsp; type " + les.keys.map((k) => `<kbd>${k}</kbd>`).join(" ") : "") : "");
	$("#note").textContent = les.intro;
	$("#prog").textContent = wi === 0 && les.sound ? "the new sound, on its own — keys shown" : `${wi + 1} / ${les.words.length}`;
	$("#target").textContent = `/${word().target}/`;
	$("#target").classList.toggle("masked", ear && !shown); // ear mode hides the answer until solved/revealed
	$("#target").style.cursor = word().audio ? "pointer" : "default";
	$("#target").title = ear && !shown ? "listen — type what you hear" : "play the sound";
	$("#word").innerHTML = `<b>${word().word}</b>${word().gloss ? ` — ${word().gloss}` : ""}${word().lang ? ` <span class="chip">${word().lang}</span>` : ""}`;
	$("#typed").textContent = buffer;
	$("#streak").textContent = streak > 2 ? `${streak} in a row` : "";
	$("#barfill").style.width = lesson().words.length ? `${((wi + 1) / lesson().words.length) * 100}%` : "0";
	renderHint();
	highlightKeyboard();
}
function goWord(newLesson: boolean) {
	buffer = ""; misses = 0; shown = false;
	hinted = !ear && wi === 0;   // first word of a lesson shows its keys — but never in ear mode
	render();
	if (ear) playWord();                              // ear mode: always play the thing to transcribe
	else if (newLesson && lesson().audio) playSound(); // else: new-sound lessons open on the phoneme
	else playWord();
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
	const b = buffer.normalize("NFC");
	if (b === word().target.normalize("NFC")) {
		shown = true; render(); // reveal the answer as the reward (un-masks it in ear mode)
		$("#typedwrap").classList.add("good");
		setTimeout(() => { $("#typedwrap").classList.remove("good"); next(); }, 350);
		return;
	}
	// Fire wrongness only on genuine *deviation* — when the buffer no longer sits
	// anywhere along the taught keystroke path. Intermediate states that still lead
	// to the target are fine: e.g. "dʌn" on the way to "dʌŋ" (before ⇧G rewrites
	// n→ŋ) reaches full length but is on-path, so it must NOT flash red. A real
	// wrong key deviates from every prefix and fires at once.
	const labels = word().labels;
	for (let p = 0; p < labels.length; p++)
		if (simulate(labels, p).normalize("NFC") === b) return; // on-path, still typing
	misses += 1;
	const w = $("#typedwrap");
	w.classList.remove("bad"); void w.offsetWidth; w.classList.add("bad"); // restart the shake on each fresh deviation
	setTimeout(() => w.classList.remove("bad"), 420);
	renderHint();
}

// ------------------------------------------------------------ input core
function doBackspace() {
	const edit = handleBackspace(buffer);
	buffer = edit.type === "pass" ? dropLastCluster(buffer) : applyEdit(buffer, edit);
	render();
}
function sendKey(k: Keystroke) {
	buffer = applyEdit(buffer, handleKey(buffer, k, CHAIN), nativeChar(k));
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
	for (let i = 0; i < upto; i++) { const k = keystrokeFromLabel(labels[i]); b = applyEdit(b, handleKey(b, k, CHAIN), nativeChar(k)); }
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
$("#target").addEventListener("click", playWord);
document.querySelector("#say")?.addEventListener("click", playWord);
const earBtn = document.querySelector("#ear");
earBtn?.setAttribute("aria-pressed", String(ear)); // reflect persisted state on load
earBtn?.addEventListener("click", () => {
	ear = !ear; save();
	earBtn.setAttribute("aria-pressed", String(ear));
	goWord(false); // re-cast the current word under the new mode
});
goWord(true);
