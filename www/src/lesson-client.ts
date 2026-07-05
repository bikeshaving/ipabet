// Lesson client: multiple-choice checks + audio transcription tests.
// Transcription input runs the real engine; audio is browser speech
// synthesis for now (recorded audio is a straight upgrade later).

import {
	handleKey,
	handleBackspace,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../lib/src/index.ts";

interface Choice {
	text: string;
	correct?: boolean;
}
interface Quiz {
	q: string;
	choices: Choice[];
	explain: string;
}
interface Transcribe {
	word: string;
	say?: string;
	target: string;
	labels: string[];
	note?: string;
}

declare global {
	interface Window {
		__QUIZ: Quiz[];
		__TRANSCRIBE: Transcribe[];
	}
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

// ------------------------------------------------------------------ quiz

function renderQuiz() {
	const host = $("#quiz");
	window.__QUIZ.forEach((item, qi) => {
		const div = document.createElement("div");
		div.className = "qitem";
		div.innerHTML = `<p class="q">${item.q}</p>` +
			item.choices
				.map((c, ci) => `<button class="choice" data-q="${qi}" data-c="${ci}">${c.text}</button>`)
				.join("") +
			`<p class="explain" hidden>${item.explain}</p>`;
		host.appendChild(div);
	});
	host.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement).closest(".choice") as HTMLElement | null;
		if (!btn || btn.classList.contains("locked")) return;
		const item = window.__QUIZ[Number(btn.dataset.q)];
		const choice = item.choices[Number(btn.dataset.c)];
		const parent = btn.parentElement!;
		if (choice.correct) {
			for (const b of parent.querySelectorAll(".choice")) b.classList.add("locked");
			btn.classList.add("right");
			(parent.querySelector(".explain") as HTMLElement).hidden = false;
		} else {
			btn.classList.add("wrong", "locked");
		}
	});
}

// ----------------------------------------------------------- transcription

let ti = 0;
let buffer = "";
let misses = 0;

function speak() {
	const item = window.__TRANSCRIBE[ti];
	const u = new SpeechSynthesisUtterance(item.say ?? item.word);
	u.lang = "en-US";
	u.rate = 0.85;
	speechSynthesis.cancel();
	speechSynthesis.speak(u);
}

function renderT() {
	const items = window.__TRANSCRIBE;
	if (ti >= items.length) {
		$("#tdrill").innerHTML = `<p class="done">Lesson complete — /wɛl dʌn/. <a href="/learn">Back to /learn</a></p>`;
		return;
	}
	const item = items[ti];
	$("#tcount").textContent = `${ti + 1} / ${items.length}`;
	$("#tword").textContent = misses >= 1 ? `“${item.word}”` : "";
	$("#ttyped").textContent = buffer;
	$("#tnote").textContent = item.note ?? "";
	$("#thint").innerHTML = misses >= 3
		? item.labels.map((l) => `<kbd>${l}</kbd>`).join("") +
			` <span class="ans ipa">/${item.target}/</span>`
		: "";
}

function checkT() {
	const item = window.__TRANSCRIBE[ti];
	if (buffer.normalize("NFC") === item.target.normalize("NFC")) {
		$("#ttyped").classList.add("good");
		setTimeout(() => {
			$("#ttyped").classList.remove("good");
			ti += 1;
			buffer = "";
			misses = 0;
			renderT();
			if (ti < window.__TRANSCRIBE.length) speak();
		}, 450);
	} else if (buffer.length >= item.target.length) {
		misses += 1;
		$("#ttyped").classList.add("bad");
		setTimeout(() => $("#ttyped").classList.remove("bad"), 250);
		renderT();
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

// Only capture keys while the transcription area is "armed" (after the
// learner clicks play/into it), so the quiz above stays mouse-friendly.
let armed = false;
$("#tdrill").addEventListener("click", () => { armed = true; $("#tdrill").classList.add("armed"); });

window.addEventListener("keydown", (e) => {
	if (!armed || ti >= window.__TRANSCRIBE.length) return;
	if (e.metaKey || e.ctrlKey) return;
	if (e.key === "Backspace") {
		e.preventDefault();
		const edit = handleBackspace(buffer);
		buffer = edit.type === "pass" ? dropLastCluster(buffer) : applyEdit(buffer, edit);
		renderT();
		return;
	}
	const k = keyFromEvent(e);
	if (k === null) return;
	e.preventDefault();
	const edit = handleKey(buffer, k);
	buffer = applyEdit(buffer, edit, nativeChar(k));
	renderT();
	checkT();
});

$("#play").addEventListener("click", () => { armed = true; $("#tdrill").classList.add("armed"); speak(); });

renderQuiz();
renderT();
