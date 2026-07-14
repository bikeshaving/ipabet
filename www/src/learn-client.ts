// /learn client — walks the fixed, hand-designed course (curriculum.ts) lesson
// by lesson: each lesson introduces one new sound (keys shown, its phoneme
// plays) and drills a set of real words in order, mixing the new sound with
// ones learned earlier. Keystrokes run the real IPAbet engine (@b9g/ipabet).
//
// The view is Crank: the drill and the on-screen keyboard are components that
// re-render from module state. No innerHTML, no createElement — the server
// renders empty #drill / #kbd mounts and Crank owns everything inside them.

import {jsx, renderer} from "@b9g/crank/standalone";
import {keyFromEvent, mediatedByIME} from "./ipa-input.ts";
import {keystrokeFromLabel} from "./keystrokes.ts";
import {
	handleKey,
	handleBackspace,
	type Pending,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../js/src/index.ts";

interface Word { word: string; lang: string; gloss: string; target: string; labels: string[]; audio?: string; }
interface Lesson { title: string; sound?: string; keys?: string[]; intro: string; audio?: string; words: Word[]; }
declare global { interface Window { __CURRICULUM: Lesson[]; } }

const LESSONS = window.__CURRICULUM;
const drillEl = document.getElementById("drill");
const kbdEl = document.getElementById("kbd");
const indexEl = document.getElementById("lessonindex");

// ---------------------------------------------------------------- state
const KEY = "ipabet-learn-course-v1";
let li = 0, wi = 0, buffer = "", misses = 0, streak = 0, hinted = false;
// The shift-chain flag: the engine owns the rule, the caller owns the flag.
let chainBroken = false;
let ear = false, shown = false; // ear-training: hide the target, type from sound; `shown` = revealed this word
let flash: "good" | "bad" | null = null; // the transient correct/wrong state on #typedwrap
let shiftArmed = false, optArmed = false;
let pending: Pending = [];
let indexOpen = false;  // the lesson index panel
let reached = 0;        // furthest lesson opened — marks the index

const clampLesson = (n: number) => Math.min(Math.max(n, 0), LESSONS.length - 1);
try {
	const s = JSON.parse(localStorage.getItem(KEY) || "null");
	if (s && typeof s.li === "number") li = clampLesson(s.li);
	if (s && typeof s.reached === "number") reached = clampLesson(s.reached);
	if (s && s.ear) ear = true;
} catch { /* no storage */ }
reached = Math.max(reached, li); // older saves carried no `reached`
function save() {
	reached = Math.max(reached, li);
	try { localStorage.setItem(KEY, JSON.stringify({li, ear, reached})); } catch { /* ignore */ }
}
const lesson = () => LESSONS[li];
const word = () => lesson().words[wi];

// ---------------------------------------------------------------- sound
let curAudio: HTMLAudioElement | null = null;
function play(url?: string) {
	if (!url) return;
	if (curAudio) curAudio.pause();
	curAudio = new Audio(url);
	curAudio.play().catch(() => {}); // autoplay may be blocked pre-gesture; click replays
	// Restarting a CSS animation needs the class off→reflow→on; Crank doesn't
	// manage #say's className (no `class` prop), so this imperative pulse stands.
	const say = document.querySelector("#say");
	if (say) { say.classList.remove("playing"); void (say as HTMLElement).offsetWidth; say.classList.add("playing"); }
}
const playSound = () => play(lesson().audio); // the lesson's isolated phoneme (Commons recording)
const playWord = () => play(word().audio);    // the current word, baked from its IPA (Polly)

// ------------------------------------------------------------ keyboard IO
// keyFromEvent is the shared derivation (ipa-input.ts) — /learn has no text
// field of its own (it reads the window and has an on-screen keyboard), but the
// keystroke rules must not be a second, drifting copy.
const segmenter = new Intl.Segmenter();
function dropLastCluster(text: string): string {
	let last = "";
	for (const s of segmenter.segment(text)) last = s.segment;
	return text.slice(0, text.length - last.length);
}

// ------------------------------------------------------------ path walking
function simulate(labels: string[], upto: number): string {
	let b = "";
	for (let i = 0; i < upto; i++) { const k = keystrokeFromLabel(labels[i]); b = applyEdit(b, handleKey(b, k).edit, nativeChar(k)); }
	return b;
}
/** How many of the word's keystrokes are already typed — the position along the
 *  taught path. Drives the progressive lighting of the key bars. 0 when off-path. */
function progress(): number {
	const labels = word().labels;
	const b = buffer.normalize("NFC");
	for (let p = 0; p <= labels.length; p++) if (simulate(labels, p).normalize("NFC") === b) return p;
	return 0;
}
function nextKeystroke(): Keystroke | null {
	const labels = word().labels;
	for (let p = 0; p <= labels.length; p++)
		if (simulate(labels, p).normalize("NFC") === buffer.normalize("NFC")) return p < labels.length ? keystrokeFromLabel(labels[p]) : null;
	return labels.length ? keystrokeFromLabel(labels[0]) : null;
}

// ------------------------------------------------------------- components
function Drill() {
	const les = lesson();
	const w = word();
	const p = progress();
	const earHide = ear && !shown;                       // ear mode hides the answer until solved/revealed
	const showKeys = hinted || misses >= 2 || (ear && shown);
	const pct = les.words.length ? ((wi + 1) / les.words.length) * 100 : 0;

	return jsx`
		<div id="bar"><div id="barfill" style=${`width:${pct}%`}></div></div>
		<div id="stage">
			Lesson ${li + 1} / ${LESSONS.length} — ${les.title}${
				les.sound
					? jsx` · new sound <span class="g">/${les.sound}/</span>${
							les.keys ? jsx`  type ${les.keys.map((k) => jsx`<kbd>${k}</kbd> `)}` : null
						}`
					: null
			}
		</div>
		<div id="note">${les.intro}</div>
		<div id="prog">${wi === 0 && les.sound ? "the new sound, on its own — keys shown" : `${wi + 1} / ${les.words.length}`}</div>
		<div id="hero">
			<div id="target" class=${earHide ? "ipa masked" : "ipa"}
				style=${`cursor:${w.audio ? "pointer" : "default"}`}
				title=${earHide ? "listen — type what you hear" : "play the sound"}
				onclick=${playWord}>/${w.target}/</div>
			<button id="say" aria-label="Play the sound" onclick=${playWord}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.4 4.4 5.3H1.8v5.4h2.6L8 13.6z" fill="currentColor"/><path d="M10.4 5.3a3.4 3.4 0 0 1 0 5.4M12 3.5a5.8 5.8 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
		</div>
		<div id="word"><b>${w.word}</b>${w.gloss ? ` — ${w.gloss}` : ""}${w.lang ? jsx` <span class="chip">${w.lang}</span>` : null}</div>
		<div id="typedwrap" class=${flash ?? undefined}><span id="typed">${buffer}</span><span class="caret"></span></div>
		<div id="hint">${
			earHide
				? jsx`<button id="hintbtn" onclick=${() => { shown = true; hinted = true; render(); }}>reveal answer</button>`
				: showKeys
					// The keys as bars that light as you walk the sequence.
					? w.labels.map((l, i) => jsx`<kbd class=${i < p ? "hit" : undefined}>${l}</kbd>`)
					: jsx`<button id="hintbtn" onclick=${() => { hinted = true; render(); }}>show keys</button>`
		}</div>
		<div id="streak">${streak > 2 ? `${streak} in a row` : ""}</div>`;
}

const KB_ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];
function Keyboard() {
	const nk = nextKeystroke(); // the key that should light next
	const cap = (txt: string, cls: string, k: string, on: () => void) => jsx`
		<button class=${cls} data-k=${k || undefined}
			onmousedown=${(e: Event) => e.preventDefault()}
			onclick=${(e: Event) => { e.preventDefault(); on(); }}>${txt}</button>`;
	const hot = (ch: string) => "kb" + (nk !== null && nk.key === ch ? " hot" : "");
	const mod = (base: string, armed: boolean, need: boolean) =>
		base + (armed ? " armed" : "") + (need ? " need" : "");

	return jsx`
		${KB_ROWS.map((chars, ri) => jsx`
			<div class="kbrow">
				${ri === 3 ? cap("⇧", mod("kb wide mshift", shiftArmed, nk?.shift === true), "", () => { shiftArmed = !shiftArmed; render(); }) : null}
				${[...chars].map((ch) => cap(ch, hot(ch), ch, () => tapChar(ch)))}
				${ri === 3 ? cap("⌫", "kb wide", "", doBackspace) : null}
			</div>`)}
		<div class="kbrow">
			${cap("⌥", mod("kb wide mopt", optArmed, nk?.option === true), "", () => { optArmed = !optArmed; render(); })}
			${cap("space", hot(" ") + " space", " ", () => tapChar(" "))}
		</div>`;
}

/** The lesson index: every lesson in the course, visible at once. The one you're
 *  on is marked; anything you've already reached is shown as visited, so a
 *  31-lesson course is browsable instead of a linear tunnel. */
function LessonIndex() {
	if (!indexOpen) return null;
	return jsx`
		<ol class="lessonlist">
			${LESSONS.map((l, i) => {
				const cls = "lessonitem"
					+ (i === li ? " current" : "")
					+ (i <= reached ? " visited" : "");
				return jsx`
					<li>
						<button class=${cls} onclick=${() => { indexOpen = false; goLesson(i); render(); }}>
							<span class="n">${i + 1}</span>
							<span class="t">${l.title}</span>
							${l.sound ? jsx`<span class="s ipa">/${l.sound}/</span>` : null}
						</button>
					</li>`;
			})}
		</ol>`;
}

// ---------------------------------------------------------------- render
function render() {
	if (drillEl) renderer.render(jsx`<${Drill} />`, drillEl);
	if (kbdEl) renderer.render(jsx`<${Keyboard} />`, kbdEl);
	if (indexEl) renderer.render(jsx`<${LessonIndex} />`, indexEl);
	syncNav();
}
function syncNav() {
	(document.getElementById("prevlesson") as HTMLButtonElement | null)?.toggleAttribute("disabled", li === 0);
	(document.getElementById("nextlesson") as HTMLButtonElement | null)?.toggleAttribute("disabled", li === LESSONS.length - 1);
	document.getElementById("indextoggle")?.setAttribute("aria-expanded", String(indexOpen));
}

// ------------------------------------------------------------ progression
function goWord(newLesson: boolean) {
	buffer = ""; misses = 0; shown = false; flash = null; pending = []; chainBroken = false;
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
/** Jump to a lesson (prev/next buttons or the picker). Clamped; resets to word 1. */
function goLesson(n: number) {
	const clamped = Math.min(Math.max(n, 0), LESSONS.length - 1);
	if (clamped === li && wi === 0) return;
	li = clamped; wi = 0; save();
	goWord(true);
}
function check() {
	const b = buffer.normalize("NFC");
	if (b === word().target.normalize("NFC")) {
		shown = true;            // reveal the answer as the reward (un-masks it in ear mode)
		flash = "good";
		render();
		setTimeout(() => { flash = null; next(); }, 350);
		return;
	}
	// Fire wrongness only on genuine *deviation* — when the buffer no longer sits
	// anywhere along the taught keystroke path. Intermediate states that still lead
	// to the target are fine: e.g. "dʌn" on the way to "dʌŋ" (before ⇧G rewrites
	// n→ŋ) reaches full length but is on-path, so it must NOT flash red.
	const labels = word().labels;
	for (let p = 0; p < labels.length; p++)
		if (simulate(labels, p).normalize("NFC") === b) return; // on-path, still typing
	misses += 1;
	flash = "bad"; // a red state, no motion (see learn.css)
	render();
	setTimeout(() => { flash = null; render(); }, 420);
}

// ------------------------------------------------------------ input core
function doBackspace() {
	const step = handleBackspace(buffer, pending);
	pending = step.pending;
	if (step.edit.type === "noop") { render(); return; }
	buffer = step.edit.type === "pass" ? dropLastCluster(buffer) : applyEdit(buffer, step.edit);
	render();
}
function sendKey(k: Keystroke) {
	// Thread the shift-chain, exactly as bindIPAInput and the IME do: hold ⇧ across
	// a run and each capital rebases for the next modifier; release ⇧ and the chain
	// breaks. The engine owns the rule but not the flag — only the caller sees the
	// release, so a caller that drops it leaves the chain permanently live.
	const step = handleKey(buffer, k, pending, chainBroken);
	chainBroken = step.chainBroken ?? false;
	pending = step.pending;
	buffer = applyEdit(buffer, step.edit, nativeChar(k));
	render();
	check();
}
function tapChar(ch: string) {
	const k: Keystroke = {key: ch, shift: shiftArmed, option: optArmed};
	shiftArmed = false; optArmed = false; // the on-screen modifiers are one-shot
	sendKey(k);
}

// -------------------------------------------------------- physical keys
window.addEventListener("keyup", (e) => {
	if (e.key === "Shift") chainBroken = true; // letting go ends the IPA chain
});
window.addEventListener("keydown", (e) => {
	if (e.metaKey || e.ctrlKey) return;
	if (mediatedByIME(e)) return; // a real IME owns this keystroke
	if (e.key === "Backspace") { e.preventDefault(); doBackspace(); return; }
	const k = keyFromEvent(e);
	if (k === null) return;
	e.preventDefault();
	sendKey(k);
});

// --------------------------------------------------------------- wiring
document.getElementById("indextoggle")?.addEventListener("click", () => { indexOpen = !indexOpen; render(); });
document.getElementById("prevlesson")?.addEventListener("click", () => goLesson(li - 1));
document.getElementById("nextlesson")?.addEventListener("click", () => goLesson(li + 1));

const earBtn = document.getElementById("ear");
earBtn?.setAttribute("aria-pressed", String(ear)); // reflect persisted state on load
earBtn?.addEventListener("click", () => {
	ear = !ear; save();
	earBtn.setAttribute("aria-pressed", String(ear));
	goWord(false); // re-cast the current word under the new mode
});

goWord(true);
