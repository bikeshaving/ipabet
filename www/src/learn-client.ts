// /learn hub client. Two drill cards share the keyboard: the lede
// ("transcribe what you hear" — audio in, IPA out) and the keyboard
// trainer. Clicking a card arms it; keystrokes go to the armed card.
// Both run the real IPAbet engine (@b9g/ipabet).

import {
	handleKey,
	handleBackspace,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../js/src/index.ts";

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

interface Hear {
	word: string;
	say?: string;
	target: string;
	labels: string[];
}

declare global {
	interface Window {
		__LEVELS: Level[];
		__HEAR: Hear[];
	}
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

// ------------------------------------------------------------ keyboard IO

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

// ------------------------------------------------------------ hear drill

const hearPool = [...window.__HEAR].sort(() => Math.random() - 0.5);
let hi = 0;
let hBuffer = "";
let hMisses = 0;
let hStreak = 0;

function hearItem(): Hear {
	return hearPool[hi % hearPool.length];
}

let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
	const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
	// Prefer enhanced/premium local voices: far clearer final consonants.
	voice =
		vs.find((v) => /premium|enhanced/i.test(v.name)) ??
		vs.find((v) => /samantha|alex|ava|allison/i.test(v.name)) ??
		vs.find((v) => v.localService) ?? vs[0] ?? null;
}
pickVoice();
speechSynthesis.addEventListener?.("voiceschanged", pickVoice);

function say(word: string) {
	// Twice, with a beat between: TTS clips word-final stops, and the second
	// token usually gets a cleaner release.
	speechSynthesis.cancel();
	for (const text of [word, word]) {
		const u = new SpeechSynthesisUtterance(text);
		u.lang = "en-US";
		u.rate = 0.8;
		if (voice) u.voice = voice;
		speechSynthesis.speak(u);
	}
}

function speak() {
	const item = hearItem();
	say(item.say ?? item.word);
}

function renderHear() {
	$("#hword").textContent = hMisses >= 1 ? `“${hearItem().word}”` : "";
	$("#htyped").textContent = hBuffer;
	$("#hhint").innerHTML = hMisses >= 3
		? hearItem().labels.map((l) => `<kbd>${l}</kbd>`).join("") +
			` <span class="ans ipa">/${hearItem().target}/</span>`
		: "";
	$("#hstreak").textContent = hStreak > 1 ? `${hStreak} in a row` : "";
}

function checkHear() {
	const item = hearItem();
	if (hBuffer.normalize("NFC") === item.target.normalize("NFC")) {
		hStreak = hMisses === 0 ? hStreak + 1 : 0;
		$("#htyped").classList.add("good");
		setTimeout(() => {
			$("#htyped").classList.remove("good");
			hi += 1;
			hBuffer = "";
			hMisses = 0;
			renderHear();
			speak();
		}, 450);
	} else if (hBuffer.length >= item.target.length) {
		hMisses += 1;
		$("#htyped").classList.add("bad");
		setTimeout(() => $("#htyped").classList.remove("bad"), 250);
		renderHear();
	}
}

// -------------------------------------------------------- keyboard drill

const levels = window.__LEVELS;
let li = 0;
let di = 0;
let kBuffer = "";
let kMisses = 0;
let kStreak = 0;
let hinted = false;

function drill(): Drill {
	return levels[li].drills[di];
}

function renderHint() {
	const show = hinted || kMisses >= 2;
	$("#hint").innerHTML = show
		? drill().labels.map((l) => `<kbd>${l}</kbd>`).join("")
		: `<button id="hintbtn">show keys</button>`;
	const btn = document.querySelector("#hintbtn");
	if (btn) btn.addEventListener("click", (e) => {
		e.stopPropagation();
		hinted = true;
		renderHint();
	});
}

function renderKb() {
	const lv = levels[li];
	$("#level").textContent = `${lv.title} — ${di + 1}/${lv.drills.length}`;
	$("#blurb").textContent = lv.blurb;
	$("#target").textContent = drill().target;
	$("#word").textContent = drill().word ? `“${drill().word}”` : "";
	$("#typed").textContent = kBuffer;
	$("#streak").textContent = kStreak > 2 ? `${kStreak} in a row` : "";
	renderHint();
}

function advanceKb() {
	kStreak = kMisses === 0 && !hinted ? kStreak + 1 : 0;
	kBuffer = "";
	kMisses = 0;
	hinted = false;
	di += 1;
	if (di >= levels[li].drills.length) {
		di = 0;
		li = (li + 1) % levels.length;
	}
	renderKb();
}

function checkKb() {
	if (kBuffer.normalize("NFC") === drill().target.normalize("NFC")) {
		$("#typed").classList.add("good");
		setTimeout(() => {
			$("#typed").classList.remove("good");
			advanceKb();
		}, 350);
	} else if (kBuffer.length >= drill().target.length) {
		kMisses += 1;
		$("#typed").classList.add("bad");
		setTimeout(() => $("#typed").classList.remove("bad"), 250);
		renderHint();
	}
}

// --------------------------------------------------------------- routing

type Card = "hear" | "kb";
let armed: Card | null = null;

function arm(card: Card) {
	armed = card;
	$("#hear").classList.toggle("armed", card === "hear");
	$("#drill").classList.toggle("armed", card === "kb");
}

$("#hear").addEventListener("click", () => arm("hear"));
$("#drill").addEventListener("click", () => arm("kb"));
$("#play").addEventListener("click", () => { arm("hear"); speak(); });

window.addEventListener("keydown", (e) => {
	if (armed === null || e.metaKey || e.ctrlKey) return;
	const isHear = armed === "hear";
	const buffer = isHear ? hBuffer : kBuffer;
	if (e.key === "Backspace") {
		e.preventDefault();
		const edit = handleBackspace(buffer);
		const next = edit.type === "pass" ? dropLastCluster(buffer) : applyEdit(buffer, edit);
		if (isHear) { hBuffer = next; renderHear(); }
		else { kBuffer = next; renderKb(); }
		return;
	}
	const k = keyFromEvent(e);
	if (k === null) return;
	e.preventDefault();
	const edit = handleKey(buffer, k);
	const next = applyEdit(buffer, edit, nativeChar(k));
	if (isHear) { hBuffer = next; renderHear(); checkHear(); }
	else { kBuffer = next; renderKb(); checkKb(); }
});

renderHear();
renderKb();
