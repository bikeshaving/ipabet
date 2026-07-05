import {CSS} from "./style.ts";
import {LESSONS, COMING, type Lesson} from "./lessons.ts";
// Shovel's asset pipeline rewrites this import to a hashed URL string at
// build time; TypeScript sees the module itself, hence the ignore.
// @ts-ignore
import lessonClient from "./lesson-client.ts" with {assetBase: "/assets/"};

const LESSON_CSS = `
.lesson h2 { margin-top: 2.5rem; }
.lesson .summary { color: var(--dim); }
.qitem { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.25rem; margin-top: 1rem; }
.qitem .q { font-weight: 600; margin-bottom: 0.6rem; }
.choice {
	display: block; width: 100%; text-align: left; background: var(--bg);
	border: 1px solid var(--line); border-radius: 8px; color: var(--fg);
	padding: 0.5rem 0.75rem; margin-top: 0.4rem; cursor: pointer; font-size: 0.95rem;
}
.choice:hover { border-color: var(--accent); }
.choice.right { border-color: #1a7f37; }
.choice.wrong { border-color: #c43a3a; opacity: 0.6; }
.choice.locked { cursor: default; }
.explain { color: var(--dim); font-size: 0.9rem; margin-top: 0.6rem; }
#tdrill {
	background: var(--card); border: 1px solid var(--line); border-radius: 12px;
	padding: 1.5rem; margin-top: 1rem; text-align: center;
}
#tdrill.armed { border-color: var(--accent); }
#tcount { color: var(--dim); font-size: 0.85rem; }
#play {
	background: var(--accent); color: #fff; border: none; border-radius: 8px;
	padding: 0.5rem 1.25rem; font-size: 1rem; cursor: pointer; margin-top: 0.5rem;
}
#tword { color: var(--dim); height: 1.4rem; margin-top: 0.5rem; }
#ttyped {
	font-size: 2.2rem; height: 3.4rem; line-height: 3.4rem; margin-top: 0.5rem;
	border-bottom: 2px solid var(--line); display: inline-block; min-width: 12rem;
	font-family: "Charis SIL", "Doulos SIL", "Times New Roman", serif;
}
#ttyped.good { border-color: #1a7f37; }
#ttyped.bad { border-color: #c43a3a; }
#thint { height: 2rem; margin-top: 0.75rem; }
#thint .ans { margin-left: 0.5rem; }
#tnote { color: var(--dim); font-size: 0.85rem; height: 1.4rem; margin-top: 0.4rem; }
.done { font-size: 1.2rem; }
`;

export function lessonHTML(lesson: Lesson): string {
	const sections = lesson.sections
		.map((s) => `<section><h2>${s.h}</h2><p>${s.body}</p></section>`)
		.join("\n");
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${lesson.title} — IPAbet /learn</title>
<meta name="description" content="${lesson.summary}">
<style>${CSS}${LESSON_CSS}</style>
</head>
<body>
<main class="lesson">
	<header>
		<h1><a href="/learn" style="text-decoration:none;color:inherit">/learn</a></h1>
		<p class="tagline">${lesson.title}</p>
		<p class="trust">${lesson.summary}</p>
	</header>

	${sections}

	<section>
		<h2>Check yourself</h2>
		<div id="quiz"></div>
	</section>

	<section>
		<h2>Transcribe what you hear</h2>
		<p class="summary">Click play, listen, and type the broad transcription
		(no slashes needed). Wrong answers replay clues: first the word, then —
		after three tries — the keys.</p>
		<div id="tdrill">
			<div id="tcount"></div>
			<button id="play">🔊 play</button>
			<div id="tword"></div>
			<div><span id="ttyped"></span></div>
			<div id="thint"></div>
			<div id="tnote"></div>
		</div>
	</section>

	<footer>
		<a href="/learn">← All lessons</a>
		<a href="/chart">The chart</a>
	</footer>
</main>
<script>
window.__QUIZ = ${JSON.stringify(lesson.quiz)};
window.__TRANSCRIBE = ${JSON.stringify(lesson.transcribe)};
</script>
<script type="module" src="${lessonClient}"></script>
</body>
</html>`;
}

export function lessonIndexSection(): string {
	const items = LESSONS.map(
		(l) =>
			`<div class="card"><h3><a href="/learn/${l.slug}">${l.title}</a></h3><p>${l.summary}</p></div>`,
	).join("");
	const coming = COMING.map((c) => `<div class="card"><h3>${c}</h3><p>Coming soon.</p></div>`).join("");
	return `<section>
		<h2>Lessons — learn to transcribe</h2>
		<p class="summary">Guided transcription lessons for English speakers:
		read, check yourself, then transcribe from audio. The keyboard drills
		above teach your fingers; these teach your ears.</p>
		<div class="cards">${items}${coming}</div>
	</section>`;
}
