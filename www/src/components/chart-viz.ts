// @ts-nocheck
// Interactive IPA charts (vowel + pulmonic consonant), embedded on /design and
// the landing page. One component each: server-rendered where the markdown
// places them, hydrated by clients/charts.ts. Keystrokes and the audio map
// arrive as props; the server render is silent (no audio URLs), the hydration
// pass supplies them.

import {jsx} from "@b9g/crank/standalone";
import spec from "../../../spec/ipabet.json";
import {keySpelled} from "../keystrokes.ts";

/* --------------------------------------------------------------- audio --- */
let AUDIO: Record<string, string> = {};
let curAudio: HTMLAudioElement | null = null;
function playGlyph(sym: string): void {
	const url = AUDIO[sym];
	if (!url) return;
	if (curAudio) curAudio.pause();
	curAudio = new Audio(url);
	curAudio.play().catch(() => {}); // autoplay may be blocked pre-gesture; click replays
}

/* =========================================================== VOWELS ====== */
/* x: backness 0=front..1=back ; yo: openness 0=close..1=open ; r: rounded
   f1/f2: typical Hz (illustrative, adult male averages)                     */
const VOWELS = [
	{sym:"i", key:"i",   x:0,   yo:0,    r:0, f1:240, f2:2400, name:"Close front unrounded"},
	{sym:"y", key:"y",   x:0,   yo:0,    r:1, f1:235, f2:2100, name:"Close front rounded"},
	{sym:"ɨ", key:"iY",  x:.5,  yo:0,    r:0, f1:300, f2:1700, name:"Close central unrounded"},
	{sym:"ʉ", key:"uY",  x:.5,  yo:0,    r:1, f1:300, f2:1550, name:"Close central rounded"},
	{sym:"ɯ", key:"uW",  x:1,   yo:0,    r:0, f1:300, f2:1390, name:"Close back unrounded"},
	{sym:"u", key:"u",   x:1,   yo:0,    r:1, f1:250, f2:595,  name:"Close back rounded"},
	{sym:"ɪ", key:"iH",  x:.2,  yo:.18,  r:0, f1:400, f2:2000, name:"Near-close near-front unrounded"},
	{sym:"ʏ", key:"yH",  x:.2,  yo:.18,  r:1, f1:400, f2:1800, name:"Near-close near-front rounded"},
	{sym:"ʊ", key:"uH",  x:.8,  yo:.18,  r:1, f1:430, f2:1020, name:"Near-close near-back rounded"},
	{sym:"e", key:"e",   x:0,   yo:1/3,  r:0, f1:390, f2:2300, name:"Close-mid front unrounded"},
	{sym:"ø", key:"eW",  x:0,   yo:1/3,  r:1, f1:370, f2:1900, name:"Close-mid front rounded"},
	{sym:"ɘ", key:"eY",  x:.5,  yo:1/3,  r:0, f1:440, f2:1650, name:"Close-mid central unrounded"},
	{sym:"ɵ", key:"oY",  x:.5,  yo:1/3,  r:1, f1:430, f2:1450, name:"Close-mid central rounded"},
	{sym:"ɤ", key:"oW",  x:1,   yo:1/3,  r:0, f1:460, f2:1310, name:"Close-mid back unrounded"},
	{sym:"o", key:"o",   x:1,   yo:1/3,  r:1, f1:360, f2:640,  name:"Close-mid back rounded"},
	{sym:"ə", key:"5 ⇧H",  x:.5,  yo:.5,   r:0, f1:500, f2:1500, name:"Mid central (schwa)"},
	{sym:"ɛ", key:"eH",  x:0,   yo:2/3,  r:0, f1:610, f2:1900, name:"Open-mid front unrounded"},
	{sym:"œ", key:"oE",  x:0,   yo:2/3,  r:1, f1:585, f2:1710, name:"Open-mid front rounded"},
	{sym:"ɜ", key:"e⇧5", x:.5,  yo:2/3,  r:0, f1:560, f2:1550, name:"Open-mid central unrounded"},
	{sym:"ɞ", key:"o⇧5", x:.5,  yo:2/3,  r:1, f1:550, f2:1400, name:"Open-mid central rounded"},
	{sym:"ʌ", key:"uA",  x:1,   yo:2/3,  r:0, f1:600, f2:1170, name:"Open-mid back unrounded"},
	{sym:"ɔ", key:"oH",  x:1,   yo:2/3,  r:1, f1:500, f2:700,  name:"Open-mid back rounded"},
	{sym:"æ", key:"aE",  x:0,   yo:5/6,  r:0, f1:800, f2:1750, name:"Near-open front unrounded"},
	{sym:"ɐ", key:"a⇧5", x:.5,  yo:5/6,  r:0, f1:680, f2:1420, name:"Near-open central"},
	{sym:"a", key:"a",   x:0,   yo:1,    r:0, f1:850, f2:1610, name:"Open front unrounded"},
	{sym:"ɶ", key:"aW",  x:0,   yo:1,    r:1, f1:820, f2:1530, name:"Open front rounded"},
	{sym:"ɑ", key:"aH",  x:1,   yo:1,    r:0, f1:750, f2:940,  name:"Open back unrounded"},
	{sym:"ɒ", key:"oA",  x:1,   yo:1,    r:1, f1:700, f2:760,  name:"Open back rounded"},
];
// Vowel keystrokes come straight from the spec (identical on server and client
// by construction) so a layout change can never strand a stale label here.
const KEYS = Object.fromEntries(spec.letters.map((l) => [l.glyph, keySpelled(l.key)]));
for (const v of VOWELS) v.key = KEYS[v.sym] ?? v.key;
function applyProps({audio}) {
	if (audio) AUDIO = audio;
}
const VBY = Object.fromEntries(VOWELS.map((v) => [v.sym, v]));

/* pairs sharing one articulatory slot: unrounded ±dx left, rounded right   */
const VSLOT = new Map();
for (const v of VOWELS) {
	const k = `${v.x.toFixed(3)},${v.yo.toFixed(3)}`;
	if (!VSLOT.has(k)) VSLOT.set(k, []);
	VSLOT.get(k).push(v.sym);
}
function vSlotOffset(v) {
	const k = `${v.x.toFixed(3)},${v.yo.toFixed(3)}`;
	const slot = VSLOT.get(k);
	if (slot.length < 2) return 0;
	return v.sym === slot[0] ? -17 : 17;
}

const MODS = {
	base: {
		label: "bases", color: "#111827", pairs: [],
		members: ["i","y","e","a","o","u","ə"],
		desc: "Seven anchors. Six are plain letters on the periphery — i y e a o u — " +
			"plus 5 ⇧H for ə at dead center. Everything else is base + one trailing capital.",
	},
	central: {
		label: "-5", color: "#0d9488",
		members: ["ə"],
		pairs: [["e","ɜ"],["o","ɞ"],["a","ɐ"]],
		desc: "5 is the center. As a base it carries the schwa itself — 5⇧H → ə, the " +
			"digit's default like every number root — and as a modifier ⇧5 pulls a " +
			"cardinal into the ə-neighborhood: e⇧5→ɜ, o⇧5→ɞ, a⇧5→ɐ. Where ⇧Y slides " +
			"a vowel central at its own height, ⇧5 converges on the center.",
	},
	H: {
		label: "-H", color: "#d97706",
		pairs: [["i","ɪ"],["y","ʏ"],["u","ʊ"],["e","ɛ"],["o","ɔ"],["a","ɑ"]],
		desc: "The classic partner one notch toward the interior or the far corner: " +
			"lax for the close vowels (ɪ ʏ ʊ), lowered for the mids (ɛ ɔ), and for a " +
			"it slides along the open edge to back ɑ. Mirrors consonantal H (p→ɸ, t→θ): " +
			"“the other one you learn second.”",
	},
	W: {
		label: "-W", color: "#dc2626",
		pairs: [["u","ɯ"],["e","ø"],["o","ɤ"],["a","ɶ"]],
		desc: "Flip rounding in place: u→ɯ, e→ø, o→ɤ, a→ɶ. Same logic as " +
			"consonantal w→ɰ (wW). Note the asymmetry: i’s rounded twin never needs iW " +
			"because y is already a letter.",
	},
	A: {
		label: "-A", color: "#7c3aed",
		pairs: [["u","ʌ"],["o","ɒ"]],
		desc: "The open(er) counterpart: u→ʌ, o→ɒ. Rounding follows the target: " +
			"ʌ drops u’s rounding, ɒ keeps o’s.",
	},
	E: {
		label: "-E", color: "#059669",
		pairs: [["a","æ"],["o","œ"]],
		desc: "The ligature key. æ is literally a+e and œ is o+e — the keystroke spells " +
			"the glyph’s own etymology: aE, oE.",
	},
	Y: {
		label: "-Y", color: "#0284c7",
		pairs: [["i","ɨ"],["u","ʉ"],["e","ɘ"],["o","ɵ"]],
		desc: "Centralize: i→ɨ, u→ʉ, e→ɘ, o→ɵ. One uniform rule; the bar in " +
			"ɨ ʉ ɵ is the mnemonic (ɘ, a reversed e, is the odd one out).",
	},
};

const VM = {l: 84, t: 46, w: 560, h: 400};
function artPos(v) {
	const inset = 0.5 * v.yo;
	const nx = inset + v.x * (1 - inset);
	return {x: VM.l + nx * VM.w, y: VM.t + v.yo * VM.h};
}
const F2MAX = 2600, F2MIN = 500, F1MIN = 210, F1MAX = 1000;
function acPos(v) {
	const nx = (Math.log(F2MAX) - Math.log(v.f2)) / (Math.log(F2MAX) - Math.log(F2MIN));
	const ny = (Math.log(v.f1) - Math.log(F1MIN)) / (Math.log(F1MAX) - Math.log(F1MIN));
	return {x: VM.l + nx * VM.w, y: VM.t + ny * VM.h};
}
function lerp(a, b, t) { return a + (b - a) * t; }
function vpos(v, morph) {
	const a = artPos(v), c = acPos(v);
	const off = vSlotOffset(v) * (1 - morph);
	return {x: lerp(a.x, c.x, morph) + off, y: lerp(a.y, c.y, morph)};
}

const SWEEP = ["i","e","ɛ","a","ɑ","ɔ","o","u"];

function KeyChip({text}) {
	return jsx`<span class="chip">${text}</span>`;
}

export function *VowelApp({audio}) {
	applyProps({audio});
	let morph = 0, mod = null, selected = null, hovered = null, raf = null, sweeping = false;

	const animateTo = (target) => {
		cancelAnimationFrame(raf);
		const step = () => {
			const d = target - morph;
			if (Math.abs(d) < 0.004) { this.refresh(() => (morph = target)); return; }
			this.refresh(() => (morph += d * 0.14));
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
	};
	const onslider = (ev) => {
		cancelAnimationFrame(raf);
		this.refresh(() => (morph = ev.target.valueAsNumber / 1000));
	};
	const pick = (sym) => { playGlyph(sym); this.refresh(() => (selected = sym)); };
	const toggleMod = (k) => this.refresh(() => (mod = mod === k ? null : k));
	const sweep = async () => {
		if (sweeping) return;
		this.refresh(() => (sweeping = true));
		for (const sym of SWEEP) {
			this.refresh(() => (selected = sym));
			playGlyph(sym);
			await new Promise((r) => setTimeout(r, 640));
		}
		this.refresh(() => (sweeping = false));
	};
	// cancelAnimationFrame is a browser global; the server render unmounts too.
	this.cleanup(() => { if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf); });

	for ({} of this) {
		const m = MODS[mod];
		const emphasized = new Set();
		if (m) {
			for (const s of m.members || []) emphasized.add(s);
			for (const [a, b] of m.pairs) { emphasized.add(a); emphasized.add(b); }
		}
		const artOpacity = Math.max(0, 1 - morph * 1.6);
		const acOpacity = Math.max(0, (morph - 0.4) * 1.67);

		const P = (x, yo) => artPos({x, yo});
		const c00 = P(0,0), c10 = P(1,0), c11 = P(1,1), c01 = P(0,1);
		const rows = [1/3, 2/3].map((yo) => [P(0,yo), P(1,yo)]);
		const centerLine = [ {x:(c00.x+c10.x)/2, y:c00.y}, (() => { const p0=P(0,1), p1=P(1,1); return {x:(p0.x+p1.x)/2, y:p0.y}; })() ];
		const f2Ticks = [2400, 2000, 1600, 1200, 900, 600];
		const f1Ticks = [250, 350, 500, 700, 950];
		const sel = selected ? VBY[selected] : null;

		yield jsx`
			<div class="ipachart">
				<div class="controls">
					<div class="viewtoggle">
						<button class=${morph < 0.5 ? "on" : ""} onclick=${() => animateTo(0)}>Articulatory</button>
						<input type="range" min="0" max="1000" value=${Math.round(morph * 1000)}
									 oninput=${onslider} aria-label="Morph between articulatory and acoustic views" />
						<button class=${morph >= 0.5 ? "on" : ""} onclick=${() => animateTo(1)}>Acoustic F1×F2</button>
					</div>
					<button class="sweepbtn" onclick=${sweep} disabled=${sweeping}>
						${sweeping ? "…" : "▶"} cardinal sweep
					</button>
				</div>

				<svg viewBox="0 0 760 520" class="chart" role="img"
						 aria-label="Interactive IPA vowel chart with IPAbet keystrokes">
					<defs>
						${Object.entries(MODS).map(([k, mm]) => jsx`
							<marker id="v-arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5"
											markerWidth="7" markerHeight="7" orient="auto-start-reverse">
								<path d="M 0 1 L 9 5 L 0 9 z" fill=${mm.color} />
							</marker>
						`)}
					</defs>

					<g opacity=${artOpacity} stroke="#cbd5e1" fill="none" stroke-width="1.5">
						<polygon points="${c00.x},${c00.y} ${c10.x},${c10.y} ${c11.x},${c11.y} ${c01.x},${c01.y}" />
						${rows.map(([a, b]) => jsx`<line x1=${a.x} y1=${a.y} x2=${b.x} y2=${b.y} />`)}
						<line x1=${centerLine[0].x} y1=${centerLine[0].y}
									x2=${centerLine[1].x} y2=${centerLine[1].y} stroke-dasharray="4 5" />
					</g>
					<g opacity=${artOpacity} class="axislabels" fill="#94a3b8">
						<text x=${c00.x} y=${c00.y - 16}>Front</text>
						<text x=${(c00.x + c10.x) / 2} y=${c00.y - 16}>Central</text>
						<text x=${c10.x} y=${c10.y - 16}>Back</text>
						<text x=${c00.x - 52} y=${c00.y + 5}>Close</text>
						<text x=${P(0,1/3).x - 52} y=${P(0,1/3).y + 5}>Close-mid</text>
						<text x=${P(0,2/3).x - 52} y=${P(0,2/3).y + 5}>Open-mid</text>
						<text x=${c01.x - 52} y=${c01.y + 5}>Open</text>
					</g>

					<g opacity=${acOpacity}>
						<rect x=${VM.l} y=${VM.t} width=${VM.w} height=${VM.h}
									fill="none" stroke="#cbd5e1" stroke-width="1.5" />
						${f2Ticks.map((f) => {
							const x = acPos({f2: f, f1: F1MIN}).x;
							return jsx`
								<g>
									<line x1=${x} y1=${VM.t} x2=${x} y2=${VM.t + VM.h} stroke="#e2e8f0" stroke-width="1" />
									<text class="tick" x=${x} y=${VM.t - 8} fill="#94a3b8">${f}</text>
								</g>`;
						})}
						${f1Ticks.map((f) => {
							const y = acPos({f2: F2MAX, f1: f}).y;
							return jsx`
								<g>
									<line x1=${VM.l} y1=${y} x2=${VM.l + VM.w} y2=${y} stroke="#e2e8f0" stroke-width="1" />
									<text class="tick" x=${VM.l - 10} y=${y + 4} text-anchor="end" fill="#94a3b8">${f}</text>
								</g>`;
						})}
						<text class="axname" x=${VM.l + VM.w / 2} y=${VM.t - 26} fill="#64748b">← F2 (Hz)</text>
						<text class="axname" x=${VM.l - 58} y=${VM.t + VM.h / 2} fill="#64748b"
									transform="rotate(-90 ${VM.l - 58} ${VM.t + VM.h / 2})">← F1 (Hz)</text>
					</g>

					${m ? m.pairs.map(([aSym, bSym]) => {
						const a = vpos(VBY[aSym], morph), b = vpos(VBY[bSym], morph);
						const dx = b.x - a.x, dy = b.y - a.y;
						const len = Math.hypot(dx, dy) || 1;
						// pads pull the arrow off both circles; scale them down for close
						// pairs (e.g. ə→ɜ in acoustic view) so the line never inverts.
						const pad = Math.min(21, len * 0.33), padEnd = Math.min(24, len * 0.37);
						const x1 = a.x + (dx / len) * pad, y1 = a.y + (dy / len) * pad;
						const x2 = b.x - (dx / len) * padEnd, y2 = b.y - (dy / len) * padEnd;
						return jsx`
							<line x1=${x1} y1=${y1} x2=${x2} y2=${y2}
										stroke=${m.color} stroke-width="2.5" opacity="0.85"
										marker-end="url(#v-arrow-${mod})" />`;
					}) : null}

					${VOWELS.map((v) => {
						const p = vpos(v, morph);
						const isEmph = emphasized.has(v.sym);
						const dimmed = m && !isEmph;
						const isSel = selected === v.sym;
						const isHov = hovered === v.sym;
						const r = isSel || isHov ? 19 : 16.5;
						return jsx`
							<g key=${v.sym} class="vowel ${dimmed ? "dimmed" : ""}"
								 transform="translate(${p.x}, ${p.y})"
								 onclick=${() => pick(v.sym)}
								 onmouseenter=${() => this.refresh(() => (hovered = v.sym))}
								 onmouseleave=${() => this.refresh(() => (hovered = null))}>
								<circle r=${r}
												fill=${v.r ? "#eef2ff" : "#ffffff"}
												stroke=${isSel ? "#f59e0b" : isEmph && m ? m.color : v.r ? "#818cf8" : "#94a3b8"}
												stroke-width=${isSel || (isEmph && m) ? 3 : v.r ? 2 : 1.5} />
								<text class="sym" y="1">${v.sym}</text>
								<text class="key" y=${r + 13}>${v.key}</text>
							</g>`;
					})}
				</svg>

				<div class="legend">
					<span><span class="swatch rounded"></span> rounded</span>
					<span><span class="swatch"></span> unrounded</span>
					<span class="hint">drag the slider — front↔back becomes F2, close↔open becomes F1</span>
				</div>

				<div class="modbar">
					${Object.entries(MODS).map(([k, mm]) => jsx`
						<button class="modbtn ${mod === k ? "on" : ""}" style="--c: ${mm.color}"
										onclick=${() => toggleMod(k)}>${mm.label}</button>
					`)}
				</div>
				${m ? jsx`<p class="moddesc" style="border-color: ${m.color}">${m.desc}</p>` : jsx`
					<p class="moddesc muted">Select a modifier to see how derived vowels hang off the seven bases.
					Every non-base vowel is base + one trailing capital (except the central-vowel series on 5, which start from schwa).</p>`}

				${sel ? jsx`
					<div class="detail">
						<div class="detail-sym" onclick=${() => playGlyph(sel.sym)} title="play">${sel.sym}</div>
						<div class="detail-body">
							<div class="detail-name">${sel.name}</div>
							<div class="detail-meta">
								<${KeyChip} text=${sel.key} />
								<span>F1 ≈ ${sel.f1} Hz</span>
								<span>F2 ≈ ${sel.f2} Hz</span>
								<span>${sel.r ? "rounded" : "unrounded"}</span>
							</div>
						</div>
						<button class="playbtn" onclick=${() => playGlyph(sel.sym)}>▶ play</button>
					</div>` : null}

				<p class="viznote">Click any vowel to hear its recording (Wikimedia Commons, isolated phonemes).
					Rhoticity ˞ is vowel-then-<span class="chip">⌥R</span>. Formant values are illustrative averages.</p>
			</div>
		`;
	}
}

/* ====================================================== CONSONANTS ======= */
/* anatomical x: 0 = lips (front) … 1 = glottis (back) */
const PLACES = [
	{id:"bilabial",     label:"Bilabial",     ax:0.00},
	{id:"labiodental",  label:"Labiodental",  ax:0.055},
	{id:"dental",       label:"Dental",       ax:0.12},
	{id:"alveolar",     label:"Alveolar",     ax:0.185},
	{id:"postalveolar", label:"Postalv.",     ax:0.25},
	{id:"retroflex",    label:"Retroflex",    ax:0.315},
	{id:"palatal",      label:"Palatal",      ax:0.47},
	{id:"velar",        label:"Velar",        ax:0.62},
	{id:"uvular",       label:"Uvular",       ax:0.73},
	{id:"pharyngeal",   label:"Pharyng.",     ax:0.86},
	{id:"glottal",      label:"Glottal",      ax:1.00},
];
const PI = Object.fromEntries(PLACES.map((p, i) => [p.id, i]));
const MANNERS = [
	"Plosive","Nasal","Trill","Tap/Flap","Fricative",
	"Lateral fric.","Approximant","Lateral appr.",
];

const CONS = [
	{sym:"p", key:"p",   pl:"bilabial",    m:0, v:0},
	{sym:"b", key:"b",   pl:"bilabial",    m:0, v:1},
	{sym:"t", key:"t",   pl:"alveolar",    m:0, v:0},
	{sym:"d", key:"d",   pl:"alveolar",    m:0, v:1},
	{sym:"ʈ", key:"tR",  pl:"retroflex",   m:0, v:0},
	{sym:"ɖ", key:"dR",  pl:"retroflex",   m:0, v:1},
	{sym:"c", key:"c",   pl:"palatal",     m:0, v:0},
	{sym:"ɟ", key:"dJ",  pl:"palatal",     m:0, v:1},
	{sym:"k", key:"k",   pl:"velar",       m:0, v:0},
	{sym:"ɡ", key:"g ⇧G", pl:"velar",      m:0, v:1},
	{sym:"q", key:"q",   pl:"uvular",      m:0, v:0},
	{sym:"ɢ", key:"gQ",  pl:"uvular",      m:0, v:1},
	{sym:"ʔ", key:"2 ⇧H",  pl:"glottal",     m:0, v:0},
	{sym:"m", key:"m",   pl:"bilabial",    m:1, v:1},
	{sym:"ɱ", key:"mV",  pl:"labiodental", m:1, v:1},
	{sym:"n", key:"n",   pl:"alveolar",    m:1, v:1},
	{sym:"ɳ", key:"nR",  pl:"retroflex",   m:1, v:1},
	{sym:"ɲ", key:"nJ",  pl:"palatal",     m:1, v:1},
	{sym:"ŋ", key:"nG",  pl:"velar",       m:1, v:1},
	{sym:"ɴ", key:"nQ",  pl:"uvular",      m:1, v:1},
	{sym:"ʙ", key:"rB",  pl:"bilabial",    m:2, v:1},
	{sym:"r", key:"r",   pl:"alveolar",    m:2, v:1},
	{sym:"ʀ", key:"rG",  pl:"uvular",      m:2, v:1},
	{sym:"ⱱ", key:"4 ⇧V", pl:"labiodental", m:3, v:1},
	{sym:"ɾ", key:"4 ⇧H",  pl:"alveolar",    m:3, v:1},
	{sym:"ɽ", key:"4 ⇧R", pl:"retroflex",   m:3, v:1},
	{sym:"ɸ", key:"pH",  pl:"bilabial",    m:4, v:0},
	{sym:"β", key:"bH",  pl:"bilabial",    m:4, v:1},
	{sym:"f", key:"f",   pl:"labiodental", m:4, v:0},
	{sym:"v", key:"v",   pl:"labiodental", m:4, v:1},
	{sym:"θ", key:"tH",  pl:"dental",      m:4, v:0},
	{sym:"ð", key:"dH",  pl:"dental",      m:4, v:1},
	{sym:"s", key:"s",   pl:"alveolar",    m:4, v:0},
	{sym:"z", key:"z",   pl:"alveolar",    m:4, v:1},
	{sym:"ʃ", key:"sH",  pl:"postalveolar",m:4, v:0},
	{sym:"ʒ", key:"zH",  pl:"postalveolar",m:4, v:1},
	{sym:"ʂ", key:"sR",  pl:"retroflex",   m:4, v:0},
	{sym:"ʐ", key:"zR",  pl:"retroflex",   m:4, v:1},
	{sym:"ç", key:"cH",  pl:"palatal",     m:4, v:0},
	{sym:"ʝ", key:"gJ",  pl:"palatal",     m:4, v:1},
	{sym:"x", key:"x",   pl:"velar",       m:4, v:0},
	{sym:"ɣ", key:"gH",  pl:"velar",       m:4, v:1},
	{sym:"χ", key:"qH",  pl:"uvular",      m:4, v:0},
	{sym:"ʁ", key:"rQ",  pl:"uvular",      m:4, v:1},
	{sym:"ħ", key:"7 ⇧H",  pl:"pharyngeal",  m:4, v:0},
	{sym:"ʕ", key:"3 ⇧H",  pl:"pharyngeal",  m:4, v:1},
	{sym:"h", key:"h",   pl:"glottal",     m:4, v:0},
	{sym:"ɦ", key:"hH",  pl:"glottal",     m:4, v:1},
	{sym:"ɬ", key:"sL",  pl:"alveolar",    m:5, v:0},
	{sym:"ɮ", key:"zL",  pl:"alveolar",    m:5, v:1},
	{sym:"ʋ", key:"vH",  pl:"labiodental", m:6, v:1},
	{sym:"ɹ", key:"rH",  pl:"alveolar",    m:6, v:1},
	{sym:"ɻ", key:"rR",  pl:"retroflex",   m:6, v:1},
	{sym:"j", key:"j",   pl:"palatal",     m:6, v:1},
	{sym:"ɰ", key:"wW",  pl:"velar",       m:6, v:1},
	{sym:"l", key:"l",   pl:"alveolar",    m:7, v:1},
	{sym:"ɭ", key:"lR",  pl:"retroflex",   m:7, v:1},
	{sym:"ʎ", key:"lJ",  pl:"palatal",     m:7, v:1},
	{sym:"ʟ", key:"lG",  pl:"velar",       m:7, v:1},
];
const CBY = Object.fromEntries(CONS.map((c) => [c.sym, c]));

const CELL = new Map();
for (const c of CONS) {
	const k = `${c.pl}:${c.m}`;
	if (!CELL.has(k)) CELL.set(k, []);
	CELL.get(k).push(c.sym);
}
function cSlotOffset(c) {
	const cell = CELL.get(`${c.pl}:${c.m}`);
	if (cell.length < 2) return 0;
	return c.sym === cell[0] ? -13 : 13;
}

const OPS = {
	base: {
		label:"bases", color:"#111827", pairs:[],
		members:["p","b","t","d","c","ɟ","k","ɡ","q","m","n","r","f","v","s","z","l","h","j","x"],
		desc:"The plain-letter keys — no trailing capital. Everything else is one of these plus a single operator letter, so the keyboard covers the whole grid with ~20 roots.",
	},
	H: {
		label:"-H", color:"#dc2626",
		pairs:[["p","ɸ"],["b","β"],["t","θ"],["d","ð"],["c","ç"],["ɡ","ɣ"],["q","χ"],["s","ʃ"],["z","ʒ"],["h","ɦ"]],
		desc:"The frication operator: turn a plosive into the fricative at its own place — p→ɸ, t→θ, c→ç, ɡ→ɣ, q→χ. Same H that lenites vowels to “the second one you learn.” Two riders: s→ʃ z→ʒ slide one column back (there’s no sibilant plosive to sit under), and h→ɦ just voices.",
	},
	R: {
		label:"-R", color:"#d97706",
		pairs:[["t","ʈ"],["d","ɖ"],["n","ɳ"],["ɾ","ɽ"],["s","ʂ"],["z","ʐ"],["l","ɭ"],["ɹ","ɻ"]],
		desc:"Retroflex: curl the tongue tip back. The cleanest operator in the set — every arrow lands in the retroflex column.",
	},
	J: {
		label:"-J", color:"#7c3aed",
		pairs:[["d","ɟ"],["n","ɲ"],["l","ʎ"],["ɡ","ʝ"]],
		desc:"Palatalize — pull the constriction up to the hard palate: d→ɟ, n→ɲ, l→ʎ, ɡ→ʝ. (The alveolo-palatal fricatives ɕ ʑ = sJ zJ live in Other Symbols, off this grid, but share the logic.)",
	},
	Q: {
		label:"-Q", color:"#0891b2",
		pairs:[["ɡ","ɢ"],["n","ɴ"],["r","ʁ"]],
		desc:"Uvular — the back-most stop region: ɡ→ɢ, n→ɴ, r→ʁ. Q is consistently “as far back as an oral consonant goes,” which is why the ⇧-digit pharyngeals take a trailing Q too.",
	},
	G: {
		label:"-G", color:"#059669",
		pairs:[["n","ŋ"],["l","ʟ"],["r","ʀ"]],
		desc:"The back-resonant set: n→ŋ (velar nasal), l→ʟ (velar lateral), r→ʀ (uvular trill). G marks “velar-ish back” where Q would over-specify uvular — note ʀ is the one that drifts one notch further than its siblings.",
	},
	V: {
		label:"-V", color:"#db2777",
		pairs:[["m","ɱ"],["ɾ","ⱱ"]],
		desc:"Labiodental: m→ɱ, ɾ→ⱱ. Small set — the V borrows the shape of the base v (itself the labiodental fricative), so the operator names its own home column.",
	},
	L: {
		label:"-L", color:"#0284c7",
		pairs:[["s","ɬ"],["z","ɮ"]],
		desc:"Lateral airflow: s→ɬ, z→ɮ (the lateral fricatives). Same L as the lateral click lC=ǁ and lateral flap 4L=ɺ.",
	},
};

const CM = {l:118, t:78, w:742, h:404};
const COLW = CM.w / PLACES.length;
function gridX(i) { return CM.l + (i + 0.5) * COLW; }
function anatX(i) { return CM.l + PLACES[i].ax * CM.w; }
function rowY(m)  { return CM.t + (m + 0.5) / MANNERS.length * CM.h; }
function cpos(c, morph) {
	const i = PI[c.pl];
	const x = lerp(gridX(i), anatX(i), morph) + cSlotOffset(c);
	return {x, y: rowY(c.m)};
}
function roofY(ax) {
	if (ax < 0.62) return 60 - 26 * Math.sin((ax / 0.62) * Math.PI);
	return 60 + (ax - 0.62) / 0.38 * 40;
}

export function *ConsonantApp({audio}) {
	applyProps({audio});
	let morph = 0, op = null, selected = null, hovered = null, raf = null;

	const animateTo = (target) => {
		cancelAnimationFrame(raf);
		const step = () => {
			const d = target - morph;
			if (Math.abs(d) < 0.004) { this.refresh(() => (morph = target)); return; }
			this.refresh(() => (morph += d * 0.14));
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
	};
	const onslider = (ev) => { cancelAnimationFrame(raf); this.refresh(() => (morph = ev.target.valueAsNumber / 1000)); };
	const pick = (sym) => { playGlyph(sym); this.refresh(() => (selected = sym)); };
	const toggleOp = (k) => this.refresh(() => (op = op === k ? null : k));
	// cancelAnimationFrame is a browser global; the server render unmounts too.
	this.cleanup(() => { if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf); });

	for ({} of this) {
		const o = OPS[op];
		const emph = new Set();
		if (o) { for (const s of o.members || []) emph.add(s); for (const [a, b] of o.pairs) { emph.add(a); emph.add(b); } }
		const gridOp = Math.max(0, 1 - morph * 1.6);
		const anatOp = Math.max(0, (morph - 0.35) * 1.55);
		const sel = selected ? CBY[selected] : null;

		yield jsx`
			<div class="ipachart">
				<div class="controls">
					<div class="viewtoggle">
						<button class=${morph < 0.5 ? "on" : ""} onclick=${() => animateTo(0)}>Grid</button>
						<input type="range" min="0" max="1000" value=${Math.round(morph * 1000)}
									 oninput=${onslider} aria-label="Morph between grid and vocal-tract views" />
						<button class=${morph >= 0.5 ? "on" : ""} onclick=${() => animateTo(1)}>Vocal tract</button>
					</div>
				</div>

				<svg viewBox="0 0 900 560" class="chart" role="img"
						 aria-label="Interactive IPA pulmonic consonant chart with IPAbet keystrokes">
					<defs>
						${Object.entries(OPS).map(([k, oo]) => jsx`
							<marker id="pa-${k}" viewBox="0 0 10 10" refX="9" refY="5"
											markerWidth="7" markerHeight="7" orient="auto-start-reverse">
								<path d="M 0 1 L 9 5 L 0 9 z" fill=${oo.color} />
							</marker>`)}
					</defs>

					${MANNERS.map((mn, i) => jsx`
						<g>
							<text class="rowlabel" x=${CM.l - 12} y=${rowY(i) + 4}>${mn}</text>
							<line x1=${CM.l} y1=${rowY(i) + CM.h / MANNERS.length / 2}
										x2=${CM.l + CM.w} y2=${rowY(i) + CM.h / MANNERS.length / 2}
										stroke="#eef2f6" stroke-width="1" opacity=${0.5 + 0.5 * gridOp} />
						</g>`)}

					<g opacity=${gridOp}>
						${PLACES.map((p, i) => jsx`
							<g>
								<text class="collabel" x=${gridX(i)} y=${CM.t - 14}
											transform="rotate(-32 ${gridX(i)} ${CM.t - 14})">${p.label}</text>
								<line x1=${gridX(i) + COLW / 2} y1=${CM.t} x2=${gridX(i) + COLW / 2}
											y2=${CM.t + CM.h} stroke="#eef2f6" stroke-width="1" />
							</g>`)}
						<line x1=${CM.l} y1=${CM.t} x2=${CM.l + CM.w} y2=${CM.t} stroke="#cbd5e1" stroke-width="1.2" />
					</g>

					<g opacity=${anatOp}>
						<path d=${(() => {
							let dstr = `M ${CM.l} ${CM.t + roofY(0)}`;
							for (let s = 0.02; s <= 1.0001; s += 0.02) dstr += ` L ${CM.l + s * CM.w} ${CM.t + roofY(s)}`;
							return dstr;
						})()} fill="none" stroke="#c7b8e8" stroke-width="2.2" opacity="0.8" />
						<text class="mouthtag" x=${CM.l + 4} y=${CM.t + roofY(0) - 10}>lips</text>
						<text class="mouthtag" x=${CM.l + CM.w - 4} y=${CM.t + roofY(1) + 4} text-anchor="end">glottis</text>
						${PLACES.map((p, i) => jsx`
							<g>
								<line x1=${anatX(i)} y1=${CM.t + roofY(p.ax)} x2=${anatX(i)} y2=${CM.t + CM.h}
											stroke="#c7b8e8" stroke-width="1" stroke-dasharray="3 5" opacity="0.6" />
								<text class="collabel anat" x=${anatX(i)} y=${CM.t + roofY(p.ax) - 8}
											transform="rotate(-32 ${anatX(i)} ${CM.t + roofY(p.ax) - 8})">${p.label}</text>
							</g>`)}
					</g>

					${o ? o.pairs.map(([aS, bS]) => {
						const a = cpos(CBY[aS], morph), b = cpos(CBY[bS], morph);
						const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
						// scale pads down for close pairs so short arrows never invert.
						const p1 = Math.min(17, len * 0.33), p2 = Math.min(20, len * 0.37);
						return jsx`
							<line x1=${a.x + dx / len * p1} y1=${a.y + dy / len * p1}
										x2=${b.x - dx / len * p2} y2=${b.y - dy / len * p2}
										stroke=${o.color} stroke-width="2.3" opacity="0.8"
										marker-end="url(#pa-${op})" />`;
					}) : null}

					${CONS.map((c) => {
						const p = cpos(c, morph);
						const isEmph = emph.has(c.sym);
						const dim = o && !isEmph;
						const isSel = selected === c.sym, isHov = hovered === c.sym;
						const r = isSel || isHov ? 15.5 : 13.5;
						return jsx`
							<g key=${c.sym} class="cns ${dim ? "dim" : ""}"
								 transform="translate(${p.x}, ${p.y})"
								 onclick=${() => pick(c.sym)}
								 onmouseenter=${() => this.refresh(() => (hovered = c.sym))}
								 onmouseleave=${() => this.refresh(() => (hovered = null))}>
								<circle r=${r}
												fill=${c.v ? "#eef2ff" : "#ffffff"}
												stroke=${isSel ? "#f59e0b" : isEmph && o ? o.color : c.v ? "#818cf8" : "#94a3b8"}
												stroke-width=${isSel || (isEmph && o) ? 2.8 : c.v ? 1.8 : 1.4} />
								<text class="sym" y="1">${c.sym}</text>
								<text class="key" y=${r + 11}>${c.key}</text>
							</g>`;
					})}
				</svg>

				<div class="legend">
					<span><span class="swatch voiced"></span> voiced</span>
					<span><span class="swatch"></span> voiceless</span>
					<span class="hint">drag the slider — even columns become anatomical position; the coronal cluster crowds up front</span>
				</div>

				<div class="opbar">
					${Object.entries(OPS).map(([k, oo]) => jsx`
						<button class="modbtn ${op === k ? "on" : ""}" style="--c: ${oo.color}"
										onclick=${() => toggleOp(k)}>${oo.label}</button>`)}
				</div>
				${o ? jsx`<p class="moddesc" style="border-color: ${o.color}">${o.desc}</p>` : jsx`
					<p class="moddesc muted">Select an operator to see how derived consonants hang off the ~20 base letters.
					Every non-base symbol is a base plus one trailing capital (R J Q G H V L), or a ⇧-digit / ⌥-mark.</p>`}

				${sel ? jsx`
					<div class="detail">
						<div class="detail-sym" onclick=${() => playGlyph(sel.sym)} title="play">${sel.sym}</div>
						<div class="detail-body">
							<div class="detail-name">
								${PLACES[PI[sel.pl]].label} · ${MANNERS[sel.m].replace(/\.$/, "")} · ${sel.v ? "voiced" : "voiceless"}
							</div>
							<div class="detail-meta">
								<span class="chip">${sel.key}</span>
								<span>place #${PI[sel.pl] + 1} of 11</span>
							</div>
						</div>
						<button class="playbtn" onclick=${() => playGlyph(sel.sym)}>▶ play</button>
					</div>` : null}

				<p class="viznote">Click any symbol to hear its recording (Wikimedia Commons, isolated phonemes).
					Non-pulmonic consonants (clicks, implosives, ejectives) and the co-articulated / Other-Symbol
					consonants live off this grid.</p>
			</div>
		`;
	}
}

/* --------------------------------------------------------------- mount --- */
