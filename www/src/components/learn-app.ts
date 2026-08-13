import {jsx} from "@b9g/crank/standalone";
import type {Context} from "@b9g/crank/standalone";
import {keyFromEvent, mediatedByIME} from "../clients/ipa-input.ts";
import {keystrokeFromLabel} from "../keystrokes.ts";
import {displayKeys, KEYMODE_EVENT} from "../clients/keycaps.ts";
import {KB_ROWS, capBody, capTitle} from "./kbd.ts";
import {
	handleKey,
	handleBackspace,
	type Pending,
	applyEdit,
	nativeChar,
	type Keystroke,
} from "../../../js/src/index.ts";

// /learn — walks the fixed course (curriculum.ts) lesson by lesson: each
// introduces one new sound and drills real words in order. One component,
// server-rendered at its fresh-start state and hydrated by clients/learn.ts,
// which is when saved progress (localStorage) is restored.

export interface Word { word: string; lang: string; gloss: string; target: string; labels: string[]; audio?: string; }
export interface Lesson { title: string; sound?: string; keys?: string[]; intro: string; part?: string; prose?: string; review?: boolean; audio?: string; words: Word[]; }

const IS_CLIENT = typeof window !== "undefined";
const KEY = "ipabet-learn-course-v1";

export function* LearnApp(this: Context, {lessons}: {lessons: Lesson[]}) {
	// ---------------------------------------------------------------- state
	let li = 0, wi = 0, buffer = "", misses = 0, streak = 0;
	// The shift-chain flag: the engine owns the rule, the caller owns the flag.
	let chainBroken = false;
	let ear = false, shown = false; // ear-training: hide the target, type from sound; `shown` = revealed this word
	let flash: "good" | "bad" | null = null; // the transient correct/wrong state on #typedwrap
	let finished = false;   // typed past the last word of the last lesson — the finish line
	let shiftArmed = false, optArmed = false;
	let pending: Pending = [];
	let indexOpen = false;  // the lesson index panel
	let reached = 0;        // furthest lesson opened — marks the index
	// The fresh-start frame the server renders: lesson 1, keys shown, a part's
	// reveal on stage if the course opens on one.
	let hinted = true;
	let partIntro: string | null = lessons[0]?.part ?? null;

	const clampLesson = (n: number) => Math.min(Math.max(n, 0), lessons.length - 1);
	const save = () => {
		reached = Math.max(reached, li);
		try { localStorage.setItem(KEY, JSON.stringify({li, ear, reached})); } catch { /* ignore */ }
	};
	const lesson = () => lessons[li];
	const word = () => lesson().words[wi];
	const render = () => this.refresh();

	// ---------------------------------------------------------------- sound
	let curAudio: HTMLAudioElement | null = null;
	const play = (url?: string) => {
		if (!url) return;
		if (curAudio) curAudio.pause();
		curAudio = new Audio(url);
		curAudio.play().catch(() => {}); // autoplay may be blocked pre-gesture; click replays
		// Restarting a CSS animation needs the class off→reflow→on; Crank doesn't
		// manage #say's className (no `class` prop), so this imperative pulse stands.
		const say = document.querySelector("#say");
		if (say) { say.classList.remove("playing"); void (say as HTMLElement).offsetWidth; say.classList.add("playing"); }
	};
	const playSound = () => play(lesson().audio); // the lesson's isolated phoneme (Commons recording)
	const playWord = () => play(word().audio);    // the current word, baked from its IPA (Polly)

	// ------------------------------------------------------------ keyboard IO
	const segmenter = new Intl.Segmenter();
	const dropLastCluster = (text: string): string => {
		let last = "";
		for (const s of segmenter.segment(text)) last = s.segment;
		return text.slice(0, text.length - last.length);
	};

	// ------------------------------------------------------------ path walking
	const simulate = (labels: string[], upto: number): string => {
		let b = "";
		for (let i = 0; i < upto; i++) { const k = keystrokeFromLabel(labels[i]); b = applyEdit(b, handleKey(b, k).edit, nativeChar(k)); }
		return b;
	};
	/** How many of the word's keystrokes are already typed — the position along the
	 *  taught path. Drives the progressive lighting of the key bars. 0 when off-path. */
	const progress = (): number => {
		const labels = word().labels;
		const b = buffer.normalize("NFC");
		for (let p = 0; p <= labels.length; p++) if (simulate(labels, p).normalize("NFC") === b) return p;
		return 0;
	};
	const nextKeystroke = (): Keystroke | null => {
		const labels = word().labels;
		for (let p = 0; p <= labels.length; p++)
			if (simulate(labels, p).normalize("NFC") === buffer.normalize("NFC")) return p < labels.length ? keystrokeFromLabel(labels[p]) : null;
		return labels.length ? keystrokeFromLabel(labels[0]) : null;
	};

	// ------------------------------------------------------------ progression
	const goWord = (newLesson: boolean) => {
		finished = false;
		buffer = ""; misses = 0; shown = false; flash = null; pending = []; chainBroken = false;
		hinted = !ear && wi === 0;   // first word of a lesson shows its keys — but never in ear mode
		render();
		if (partIntro) return;       // the reveal holds the stage; Begin (or any key) plays
		if (ear) playWord();                              // ear mode: always play the thing to transcribe
		else if (newLesson && lesson().audio) playSound(); // else: new-sound lessons open on the phoneme
		else playWord();
	};
	const next = () => {
		streak = misses === 0 && !hinted ? streak + 1 : 0;
		wi += 1;
		if (wi < lesson().words.length) { goWord(false); return; }
		wi = 0;
		if (li < lessons.length - 1) {
			li += 1; save();
			if (lessons[li].part) partIntro = lessons[li].part!;
			goWord(true); return;
		}
		finished = true; save(); render();   // the last word of the last lesson IS the finish line
	};
	/** Jump to a lesson (prev/next buttons or the picker). Clamped; resets to word 1. */
	const goLesson = (n: number) => {
		const clamped = clampLesson(n);
		if (clamped === li && wi === 0) return;
		li = clamped; wi = 0; save();
		if (lessons[li].part) partIntro = lessons[li].part!;
		goWord(true);
	};
	const check = () => {
		const b = buffer.normalize("NFC");
		if (b === word().target.normalize("NFC")) {
			shown = true;            // reveal the answer as the reward (un-masks it in ear mode)
			flash = "good";
			render();
			setTimeout(() => { flash = null; next(); }, 350);
			return;
		}
		// Fire wrongness only on genuine *deviation* — when the buffer no longer sits
		// anywhere along the taught keystroke path. "dʌn" on the way to "dʌŋ" reaches
		// full length but is on-path, so it must NOT flash red.
		const labels = word().labels;
		for (let p = 0; p < labels.length; p++)
			if (simulate(labels, p).normalize("NFC") === b) return; // on-path, still typing
		misses += 1;
		flash = "bad"; // a red state, no motion (see learn.css)
		render();
		setTimeout(() => { flash = null; render(); }, 420);
	};

	// ------------------------------------------------------------ input core
	const doBackspace = () => {
		if (partIntro) { partIntro = null; goWord(true); return; } // any key begins
		if (finished) return; // the finish line ignores typing
		const step = handleBackspace(buffer, pending);
		pending = step.pending;
		if (step.edit.type === "noop") { render(); return; }
		buffer = step.edit.type === "pass" ? dropLastCluster(buffer) : applyEdit(buffer, step.edit);
		render();
	};
	const sendKey = (k: Keystroke) => {
		if (partIntro) { partIntro = null; goWord(true); return; } // any key begins
		if (finished) return; // the finish line ignores typing
		// Thread the shift-chain as bindIPAInput and the IME do: the engine owns the rule
		// but not the flag — only the caller sees a shift release.
		const step = handleKey(buffer, k, pending, chainBroken);
		chainBroken = step.chainBroken ?? false;
		pending = step.pending;
		buffer = applyEdit(buffer, step.edit, nativeChar(k));
		render();
		check();
	};
	const tapChar = (ch: string) => {
		if (partIntro) { partIntro = null; goWord(true); return; } // any key begins
		if (finished) return; // the finish line ignores typing
		const k: Keystroke = {key: ch, shift: shiftArmed, option: optArmed};
		shiftArmed = false; optArmed = false; // the on-screen modifiers are one-shot
		sendKey(k);
	};

	// ------------------------------------------------------------- components
	/** The sounds a part unlocks — the current lesson's part, walked forward. */
	const partSounds = () => {
		const out: {sound: string; keys: string[]; audio?: string; title: string}[] = [];
		for (let i = li; i < lessons.length && (i === li || !lessons[i].part); i++) {
			const l = lessons[i];
			if (l.sound) out.push({sound: l.sound, keys: l.keys ?? [], audio: l.audio, title: l.title});
		}
		return out;
	};

	const Drill = () => {
		const les = lesson();
		if (partIntro) {
			const sounds = partSounds();
			return jsx`
				<div id="partintro">
					<div class="eyebrow">new technology</div>
					<h2>${partIntro}</h2>
					${les.prose ? jsx`<p class="lore">${les.prose}</p>` : null}
					${sounds.length ? jsx`<div class="scards">${sounds.map((s) => jsx`
						<button class="scard" title=${s.title + " — tap to hear"} onclick=${() => play(s.audio)}>
							<span class="g ipa">${s.sound}</span>
							<span class="k">${s.keys.map((k) => displayKeys(k)).join(" ")}</span>
						</button>`)}</div>` : null}
					<button id="begin" onclick=${() => { partIntro = null; goWord(true); }}>${
						sounds.length > 1 ? `Begin — ${sounds.length} new sounds` : "Begin"
					}</button>
				</div>`;
		}
		if (finished) {
			return jsx`
				<div id="finish">
					<div class="big ipa">/kəmˈpliːt/</div>
					<p>${lessons.length} lessons — every sound on the chart, under your fingers.
					The course ends; the keyboard doesn’t.</p>
					<div class="acts">
						<button id="hintbtn" onclick=${() => { finished = false; goWord(true); }}>Practice this lesson again</button>
						<a href="/type">Open the scratchpad</a>
						<a href="/chart">The chart</a>
					</div>
				</div>`;
		}
		const w = word();
		const p = progress();
		const earHide = ear && !shown;                       // ear mode hides the answer until solved/revealed
		const showKeys = hinted || misses >= 2 || (ear && shown);
		const pct = les.words.length ? ((wi + 1) / les.words.length) * 100 : 0;

		return jsx`
			<div id="bar"><div id="barfill" style=${`width:${pct}%`}></div></div>
			<div id="stage">
				Lesson ${li + 1} / ${lessons.length} — ${les.title}${
					les.sound
						? jsx` · new sound <span class="g">/${les.sound}/</span>${
								les.keys ? jsx`  type ${les.keys.map((k) => jsx`<kbd>${displayKeys(k)}</kbd> `)}` : null
							}`
						: null
				}
			</div>
			<div id="note">${les.intro}</div>
			${les.prose ? jsx`<details id="prose"><summary>more, if you’re curious</summary><p>${les.prose}</p></details>` : null}
			<div id="prog">${wi === 0 && les.sound ? jsx`<span class="unlock">new sound</span> on its own first — keys shown` : `${wi + 1} / ${les.words.length}`}</div>
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
						? w.labels.map((l, i) => jsx`<kbd class=${i < p ? "hit" : undefined}>${displayKeys(l)}</kbd>`)
						: jsx`<button id="hintbtn" onclick=${() => { hinted = true; render(); }}>show keys</button>`
			}</div>
			<div id="streak">${streak > 2 ? `${streak} in a row` : ""}</div>`;
	};

	const Keyboard = () => {
		const nk = nextKeystroke(); // the key that should light next
		// THE board (kbd.ts), real ANSI geometry, rendered interactively. Chrome:
		// ⇧ ⌥ toggle their armed state, ⌫ and space act, the rest sit inert.
		const capStyle = (w: number) => `grid-column: span ${Math.round(w * 4)}`;
		const mod = (armed: boolean, need: boolean) => (armed ? " armed" : "") + (need ? " need" : "");
		const chromeCap = (k: {label?: string; chrome?: string; w: number}) => {
			const c = k.chrome!;
			const act =
				c === "shift" ? () => { shiftArmed = !shiftArmed; render(); } :
				c === "option" ? () => { optArmed = !optArmed; render(); } :
				c === "backspace" ? doBackspace :
				c === "space" ? () => tapChar(" ") : null;
			const label =
				c === "shift" ? displayKeys("⇧") :
				c === "option" ? displayKeys("⌥") : k.label;
			const cls = "cap chrome" + (act === null ? " inert" : "") +
				(c === "shift" ? mod(shiftArmed, nk?.shift === true) :
				 c === "option" ? mod(optArmed, nk?.option === true) :
				 c === "space" && nk !== null && nk.key === " " ? " hot" : "");
			return jsx`
				<button class=${cls} style=${capStyle(k.w)} disabled=${act === null}
					onmousedown=${(e: Event) => e.preventDefault()}
					onclick=${(e: Event) => { e.preventDefault(); act?.(); }}>${label}</button>`;
		};
		const key = (ch: string, w: number) => jsx`
			<button class=${"cap" + (nk !== null && nk.key === ch ? " hot" : "")} style=${capStyle(w)} title=${capTitle(ch)}
				onmousedown=${(e: Event) => e.preventDefault()}
				onclick=${(e: Event) => { e.preventDefault(); tapChar(ch); }}>${capBody(ch)}</button>`;

		return jsx`
			${KB_ROWS.map((row) => jsx`
				<div class="krow">
					${row.map((k) => (k.ch !== undefined ? key(k.ch, k.w) : chromeCap(k)))}
				</div>`)}`;
	};

	/** The lesson index: every lesson at once, the current one marked and everything
	 *  already reached shown as visited. */
	const LessonIndex = () => {
		if (!indexOpen) return null;
		// Everything up to the furthest lesson reached, which is what has been
		// put in front of the reader — not a claim about what they can do with it.
		const seen = lessons.slice(0, Math.max(reached, li) + 1).filter((l) => l.sound);
		return jsx`
			${seen.length ? jsx`<div class="owned">
				<span class="olabel">sounds you’ve seen · ${seen.length}</span>
				${seen.map((l) => jsx`<button class="ochip ipa" title=${l.title} onclick=${() => play(l.audio)}>${l.sound}</button>`)}
			</div>` : null}
			<ol class="lessonlist">
				${lessons.map((l, i) => {
					const cls = "lessonitem"
						+ (i === li ? " current" : "")
						+ (i <= reached ? " visited" : "");
					return jsx`
						${l.part ? jsx`<li class="part">${l.part}</li>` : null}
						<li>
							<button class=${cls} onclick=${() => { indexOpen = false; goLesson(i); render(); }}>
								<span class="n">${i + 1}</span>
								<span class="t">${l.title}</span>
								${l.review ? jsx`<span class="s rev">review</span>` : l.sound ? jsx`<span class="s ipa">/${l.sound}/</span>` : null}
							</button>
						</li>`;
				})}
			</ol>`;
	};

	// -------------------------------------------------------- physical keys
	if (IS_CLIENT) {
		this.schedule(() => {
			// Saved progress restores at hydration, not at first render — the server
			// frame is the fresh start, and the jump happens here.
			try {
				const s = JSON.parse(localStorage.getItem(KEY) || "null");
				if (s && typeof s.li === "number") li = clampLesson(s.li);
				if (s && typeof s.reached === "number") reached = clampLesson(s.reached);
				if (s && s.ear) ear = true;
			} catch { /* no storage */ }
			reached = Math.max(reached, li); // older saves carried no `reached`
			partIntro = lesson().part ?? null; // arriving on a branch shows its reveal

			const onkeyup = (e: KeyboardEvent) => {
				if (e.key === "Shift") chainBroken = true; // letting go ends the IPA chain
			};
			const onkeydown = (e: KeyboardEvent) => {
				if (e.metaKey || e.ctrlKey) return;
				if (mediatedByIME(e)) return; // a real IME owns this keystroke
				if (e.key === "Backspace") { e.preventDefault(); doBackspace(); return; }
				const k = keyFromEvent(e);
				if (k === null) return;
				e.preventDefault();
				sendKey(k);
			};
			const onmode = () => render(); // keystroke labels follow the platform toggle
			window.addEventListener("keyup", onkeyup);
			window.addEventListener("keydown", onkeydown);
			window.addEventListener(KEYMODE_EVENT, onmode);
			this.cleanup(() => {
				window.removeEventListener("keyup", onkeyup);
				window.removeEventListener("keydown", onkeydown);
				window.removeEventListener(KEYMODE_EVENT, onmode);
			});
			goWord(true);
		});
	}

	for ({lessons} of this) {
		// Keyboard Viewer convention: an armed/needed ⌥ flips the board to the
		// ⌥ layer (⌥⇧ when shift rides along).
		const nk = finished || partIntro ? null : nextKeystroke();
		const optLayer = optArmed || nk?.option === true;
		const shiftLayer = shiftArmed || (nk?.option === true && nk?.shift === true);
		const kbdCls = "kbd kbd--drill" + (optLayer ? " layer-opt" : "") + (optLayer && shiftLayer ? " layer-shift" : "");
		yield jsx`
			<div id="controls">
				<div id="lessonnav">
					<button id="prevlesson" aria-label="Previous lesson" title="Previous lesson"
						disabled=${li === 0} onclick=${() => goLesson(li - 1)}>◀</button>
					<button id="indextoggle" aria-expanded=${String(indexOpen)} title="All lessons"
						onclick=${() => { indexOpen = !indexOpen; render(); }}>All lessons</button>
					<button id="nextlesson" aria-label="Next lesson" title="Next lesson"
						disabled=${li === lessons.length - 1} onclick=${() => goLesson(li + 1)}>▶</button>
				</div>
				<button id="ear" aria-pressed=${String(ear)} title="Hide the symbol and type from the sound alone"
					onclick=${() => { ear = !ear; save(); goWord(false); }}>
					<span class="dot"></span>Ear training</button>
			</div>
			<div id="lessonindex"><${LessonIndex} /></div>
			<div id="drill"><${Drill} /></div>
			<div id="kbd"><div class=${kbdCls}><${Keyboard} /></div></div>`;
	}
}
