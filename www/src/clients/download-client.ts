// Names the file you are about to get. The DOM half, included by <Layout>.
//
// /download already redirects by User-Agent, so the link works before this runs
// and works with scripting off — this only replaces the file name in the label
// with the one you will actually receive, and skips the redirect hop.
//
// Nothing happens on a machine this does not ship for: the neutral markup the
// server rendered is better than a confident wrong answer.

import {detectTarget, downloadName, downloadPath} from "./platform.ts";

const target = detectTarget();
if (target) {
	const path = downloadPath(target);
	const name = downloadName(target);
	for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="/download"]')) {
		link.href = path;
		// Only the file name is swapped, so whatever the copy says around it —
		// bold, "Download", a trailing note — survives untouched.
		const it = document.createNodeIterator(link, NodeFilter.SHOW_TEXT);
		for (let node = it.nextNode(); node; node = it.nextNode()) {
			if (node.textContent && node.textContent.includes("IPAbet.pkg")) {
				node.textContent = node.textContent.replace("IPAbet.pkg", name);
			}
		}
	}
}
