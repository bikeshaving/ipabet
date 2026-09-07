// Hydrates the hero's download block with the machine it is running on, and
// renames the file in any prose link that spells one out.
//
// The server rendered the same component with no target. Nothing happens on a
// machine this does not ship for: the neutral markup beats a confident wrong
// answer.

import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {Downloads} from "../components/download.ts";
import {detectTarget, downloadName, downloadPath, refineTarget} from "./platform.ts";

function apply(target: ReturnType<typeof detectTarget>) {
	const root = document.getElementById("download-root");
	if (root) {
		renderer.hydrate(jsx`<${Downloads} target=${target} />`, root);
	}

	if (target) {
		const path = downloadPath(target);
		const name = downloadName(target);
		// Prose links, which are ordinary markdown and not this component's to
		// own: only the file name is swapped, so the copy around it survives
		// untouched. Idempotent, because the refine pass runs it again.
		for (const link of document.querySelectorAll<HTMLAnchorElement>(
			'a[href="/download"], a[data-download]',
		)) {
			link.href = path;
			link.dataset.download = "";
			const it = document.createNodeIterator(link, NodeFilter.SHOW_TEXT);
			for (let node = it.nextNode(); node; node = it.nextNode()) {
				const text = node.textContent ?? "";
				const match = text.match(/IPAbet\.pkg|IPAbet-(?:x64|arm64)\.msi|ipabet-ibus-(?:amd64|arm64)\.deb/);
				if (match && match[0] !== name) {
					node.textContent = text.replace(match[0], name);
				}
			}
		}
	}
}

const target = detectTarget();
apply(target);
// Windows-on-ARM only shows up in the async client hint (the frozen UA says
// x64), so correct the render once the truth arrives.
void refineTarget(target).then((refined) => {
	if (refined !== target) apply(refined);
});
