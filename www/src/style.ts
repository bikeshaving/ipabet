// Shared page styles for ipabet.org.
export const CSS = `
:root {
	--bg: #ffffff; --fg: #1a1a1a; --dim: #767676; --line: #e4e4e4;
	--accent: #2555c4; --card: #f6f6f4; --kbd-bg: #f1f1ef; --kbd-line: #c9c9c4;
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #101012; --fg: #e8e8e6; --dim: #909090; --line: #2a2a2e;
		--accent: #7aa2ff; --card: #1a1a1e; --kbd-bg: #222226; --kbd-line: #3a3a40;
	}
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	background: var(--bg); color: var(--fg); line-height: 1.6;
}
main { max-width: 46rem; margin: 0 auto; padding: 0 1.25rem 6rem; }
a { color: var(--accent); }
.ipa { font-family: "Charis SIL", "Doulos SIL", "Times New Roman", serif; font-style: normal; }
kbd {
	display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 0.8em; background: var(--kbd-bg); border: 1px solid var(--kbd-line);
	border-bottom-width: 2px; border-radius: 4px; padding: 0.05rem 0.4rem;
}
.arrow { color: var(--dim); padding: 0 0.3rem; }
.combo { white-space: nowrap; margin-right: 0.75rem; }

header { text-align: center; padding: 5rem 0 2.5rem; }
header h1 { font-size: 2.6rem; letter-spacing: -0.02em; }
header h1 .ipa { color: var(--accent); }
.tagline { font-size: 1.3rem; margin-top: 0.5rem; }
.trust { color: var(--dim); margin-top: 0.75rem; font-size: 0.95rem; }

#demo {
	background: var(--card); border: 1px solid var(--line); border-radius: 12px;
	padding: 1.5rem; margin: 2rem 0; text-align: center;
}
/* Fixed heights on every row: the demo cycles words of different lengths
   and the word caption appears late — nothing here may reflow the page. */
#demo .keys { height: 2rem; overflow: hidden; white-space: nowrap; }
#demo .keys kbd { font-size: 1rem; margin: 0 0.15rem; opacity: 0.35; transition: opacity 0.15s; }
#demo .keys kbd.hit { opacity: 1; border-color: var(--accent); }
#demo .out {
	font-size: 2.4rem; height: 3.6rem; line-height: 3.6rem;
	margin-top: 0.5rem; overflow: hidden; white-space: nowrap;
}
#demo .out .caret {
	display: inline-block; width: 2px; height: 2.2rem; background: var(--accent);
	vertical-align: -0.35rem; animation: blink 1s step-end infinite;
}
@keyframes blink { 50% { opacity: 0; } }
#demo .word { color: var(--dim); font-size: 0.9rem; height: 1.4rem; margin-top: 0.25rem; }

section { margin-top: 4rem; }
h2 { font-size: 1.5rem; margin-bottom: 0.75rem; letter-spacing: -0.01em; }
p + p { margin-top: 0.75rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem; margin-top: 1.25rem; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 1.1rem; }
.card h3 { font-size: 1.05rem; margin-bottom: 0.35rem; }
.card p { font-size: 0.92rem; color: var(--dim); }

.tablewrap { overflow-x: auto; margin-top: 1rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: 600; font-size: 0.85rem; }
td.desc { color: var(--dim); }
td.dim { color: var(--dim); }
td .ipa, td.ipa { font-size: 1.1rem; }

.compare td:first-child { white-space: nowrap; }
.yes { color: #1a7f37; } .no { color: var(--dim); }
@media (prefers-color-scheme: dark) { .yes { color: #4ade80; } }

ol.install { margin: 1rem 0 0 1.25rem; }
ol.install li { margin-bottom: 0.75rem; }
.note {
	background: var(--card); border-left: 3px solid var(--accent);
	padding: 0.75rem 1rem; border-radius: 0 8px 8px 0; margin-top: 1rem;
	font-size: 0.95rem;
}
footer {
	margin-top: 5rem; padding-top: 1.5rem; border-top: 1px solid var(--line);
	color: var(--dim); font-size: 0.9rem; display: flex; gap: 1.5rem; flex-wrap: wrap;
}
`;
