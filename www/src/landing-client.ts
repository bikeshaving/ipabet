// The hero demo animation: cycles engine-verified keystroke sequences, lighting
// each key and revealing the glyph it produces. Was an inline <script> in the
// landing template; now a module island reading its data from window.__DEMO.

interface Demo {
	word: string;
	steps: [string, string][];
}
declare global {
	interface Window { __DEMO?: Demo[]; }
}

const DEMO: Demo[] = window.__DEMO ?? [];
const keysEl = document.querySelector("#demo .keys");
const outEl = document.querySelector("#demo .out .text");
const wordEl = document.querySelector("#demo .word");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
	if (!keysEl || !outEl || !wordEl) return;
	let di = 0;
	for (;;) {
		const demo = DEMO[di % DEMO.length];
		di++;
		keysEl.innerHTML = demo.steps.map(([k]) => "<kbd>" + k + "</kbd>").join("");
		outEl.textContent = "";
		wordEl.textContent = "";
		await sleep(600);
		const kbds = keysEl.querySelectorAll("kbd");
		for (let i = 0; i < demo.steps.length; i++) {
			kbds[i].classList.add("hit");
			outEl.textContent = demo.steps[i][1];
			await sleep(380);
		}
		wordEl.textContent = "“" + demo.word + "”";
		await sleep(2200);
	}
}

if (DEMO.length) run();
