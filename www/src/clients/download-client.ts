// Hydrates the hero's download block with the machine it is running on, and
// renames the file in any prose link that spells one out.
//
// The server rendered the same component with no target. Nothing happens on a
// machine this does not ship for: the neutral markup beats a confident wrong
// answer.

import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {Downloads} from "../components/download.ts";
import {detectTarget, downloadName, downloadPath} from "./platform.ts";

const target = detectTarget();

const root = document.getElementById("download-root");
if (root) {
	renderer.hydrate(jsx`<${Downloads} target=${target} />`, root);
}

if (target) {
	const path = downloadPath(target);
	const name = downloadName(target);
	// Prose links, which are ordinary markdown and not this component's to own:
	// only the file name is swapped, so the copy around it survives untouched.
	for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="/download"]')) {
		link.href = path;
		const it = document.createNodeIterator(link, NodeFilter.SHOW_TEXT);
		for (let node = it.nextNode(); node; node = it.nextNode()) {
			if (node.textContent?.includes("IPAbet.pkg")) {
				node.textContent = node.textContent.replace("IPAbet.pkg", name);
			}
		}
	}
}
