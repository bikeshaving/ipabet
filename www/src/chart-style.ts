// Styles for the embedded interactive charts (chart-viz.ts). Ported from the
// two Crank artifacts, merged, and scoped under `.ipachart` so nothing bleeds
// into the host page's chrome. The charts render as a self-contained light
// panel — the SVG palette is hardcoded light, so the panel keeps its own light
// surface in both the site's light and dark themes rather than half-theming.
export const CHART_CSS = `
.ipachart {
	--ink: #111827; --mut: #64748b; --blue: #2563eb; --panel: #fcfcfa;
	background: var(--panel); color: var(--ink);
	border: 1px solid #e2e8f0; border-radius: 14px;
	padding: 18px 18px 14px; margin: 1.5rem 0;
	font: 15px/1.5 Charter, Georgia, "Times New Roman", serif;
}
.ipachart .controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; }
.ipachart .viewtoggle { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 280px; }
.ipachart .viewtoggle input[type=range] { flex: 1; accent-color: var(--blue); }
.ipachart .viewtoggle button, .ipachart .sweepbtn, .ipachart .playbtn {
	font: 13px/1 ui-monospace, "SF Mono", Menlo, monospace;
	padding: 7px 12px; border-radius: 7px; cursor: pointer;
	border: 1px solid #cbd5e1; background: #fff; color: var(--ink);
}
.ipachart .viewtoggle button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.ipachart .sweepbtn:disabled { opacity: 0.5; cursor: default; }

.ipachart svg.chart { width: 100%; height: auto; display: block; user-select: none; }
.ipachart .vowel, .ipachart .cns { cursor: pointer; transition: opacity 0.25s; }
.ipachart .vowel.dimmed, .ipachart .cns.dim { opacity: 0.22; }
.ipachart .vowel .sym { font: 21px Charter, Georgia, serif; text-anchor: middle; dominant-baseline: central; fill: var(--ink); pointer-events: none; }
.ipachart .cns .sym { font: 18px Charter, Georgia, serif; text-anchor: middle; dominant-baseline: central; fill: var(--ink); pointer-events: none; }
.ipachart .vowel .key { font: 11px ui-monospace, "SF Mono", Menlo, monospace; text-anchor: middle; fill: var(--blue); pointer-events: none; }
.ipachart .cns .key { font: 9.5px ui-monospace, "SF Mono", Menlo, monospace; text-anchor: middle; fill: var(--blue); pointer-events: none; }
.ipachart .axislabels text { font: 12.5px ui-monospace, Menlo, monospace; text-anchor: middle; }
.ipachart .tick { font: 11px ui-monospace, Menlo, monospace; text-anchor: middle; }
.ipachart .axname { font: 12.5px ui-monospace, Menlo, monospace; text-anchor: middle; }
.ipachart .rowlabel { font: 12px ui-monospace, Menlo, monospace; text-anchor: end; fill: #475569; }
.ipachart .collabel { font: 11.5px ui-monospace, Menlo, monospace; text-anchor: start; fill: #94a3b8; }
.ipachart .collabel.anat { fill: #8b6fc0; }
.ipachart .mouthtag { font: 11px ui-monospace, Menlo, monospace; fill: #8b6fc0; font-style: italic; }

.ipachart .legend { display: flex; gap: 18px; align-items: center; color: var(--mut); font-size: 13.5px; margin: 6px 0 16px; flex-wrap: wrap; }
.ipachart .swatch { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid #94a3b8; background: #fff; vertical-align: -2px; margin-right: 4px; }
.ipachart .swatch.rounded, .ipachart .swatch.voiced { border: 2px solid #818cf8; background: #eef2ff; }
.ipachart .legend .hint { margin-left: auto; font-style: italic; }

.ipachart .modbar, .ipachart .opbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.ipachart .modbtn { font: 14px ui-monospace, "SF Mono", Menlo, monospace; padding: 6px 13px; border-radius: 7px; cursor: pointer; border: 1.5px solid var(--c); color: var(--c); background: #fff; }
.ipachart .modbtn.on { background: var(--c); color: #fff; }
.ipachart .moddesc { border-left: 3px solid #cbd5e1; padding: 4px 0 4px 14px; margin: 0 0 8px; font-size: 15px; }
.ipachart .moddesc.muted { color: var(--mut); font-style: italic; }

.ipachart .detail { display: flex; align-items: center; gap: 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 12px 16px; margin: 8px 0; }
.ipachart .detail-sym { font-size: 40px; line-height: 1; cursor: pointer; min-width: 52px; text-align: center; }
.ipachart .detail-name { font-weight: 600; }
.ipachart .detail-meta { display: flex; gap: 14px; color: var(--mut); font-size: 13.5px; flex-wrap: wrap; font-family: ui-monospace, Menlo, monospace; margin-top: 2px; }
.ipachart .detail .playbtn { margin-left: auto; }
.ipachart .chip { font: 13px ui-monospace, "SF Mono", Menlo, monospace; color: var(--blue); background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 5px; padding: 1px 6px; }
.ipachart .viznote { color: var(--mut); font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 6px; }
@media (prefers-reduced-motion: reduce) { .ipachart * { transition: none !important; } }
`;
