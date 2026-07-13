// /chart click-to-hear: one delegated listener plays the recording on any
// [data-audio] element (glyph cells, vowel-chart SVG text). Was an inline
// <script> string in the page template; now a proper module island.

let cur: HTMLAudioElement | null = null;
document.addEventListener("click", (e) => {
	const el = (e.target as Element).closest<HTMLElement>("[data-audio]");
	if (!el) return;
	if (cur) cur.pause();
	cur = new Audio(el.dataset.audio);
	cur.play();
});
