// Names the machine you are on and the file you are about to get. The DOM half,
// included by <Layout>.
//
// /download already redirects by User-Agent, so every link works before this
// runs and works with scripting off. This replaces the guess in the markup with
// the answer, and — the part that matters — offers the other file where the
// guess cannot be trusted.
//
// The processor is the untrustworthy part. navigator reports the OS reliably
// and the architecture badly: on Windows the only API for it is Chromium-only,
// and a browser running under emulation on an ARM machine says x86. So the one
// distinction a Windows user cannot make for themselves is the one this cannot
// make for them either, and both files are offered rather than one guessed at.
//
// Nothing happens on a machine this does not ship for. The neutral markup the
// server rendered beats a confident wrong answer.

import {
	detectTarget,
	downloadName,
	downloadPath,
	type Target,
} from "./platform.ts";

const RELEASES = "https://github.com/bikeshaving/ipabet/releases/latest";

const OS_NAME: Record<Target["platform"], string> = {
	macos: "macOS",
	windows: "Windows",
	linux: "Linux",
};

/** The same machine with the other processor, where there is one to offer. */
function sibling(target: Target): Target | null {
	if (target.platform === "macos") return null;
	return {platform: target.platform, arm: !target.arm};
}

function siblingLabel(target: Target): string {
	if (target.arm) return "Intel or AMD processor?";
	return target.platform === "windows"
		? "ARM processor, such as a Snapdragon?"
		: "ARM processor, such as a Raspberry Pi?";
}

const target = detectTarget();
if (target) {
	const path = downloadPath(target);
	const name = downloadName(target);

	for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="/download"]')) {
		link.href = path;
		if (link.hasAttribute("data-download")) {
			link.textContent = `Download for ${OS_NAME[target.platform]}`;
			continue;
		}
		// A link inside prose: only the file name is swapped, so whatever the
		// copy says around it survives untouched.
		const it = document.createNodeIterator(link, NodeFilter.SHOW_TEXT);
		for (let node = it.nextNode(); node; node = it.nextNode()) {
			if (node.textContent?.includes("IPAbet.pkg")) {
				node.textContent = node.textContent.replace("IPAbet.pkg", name);
			}
		}
	}

	for (const note of document.querySelectorAll<HTMLElement>("[data-download-note]")) {
		const parts: string[] = [`<code>${name}</code>`];
		const other = sibling(target);
		if (other) {
			parts.push(
				`${siblingLabel(target)} <a href="${downloadPath(other)}">${downloadName(other)}</a>`,
			);
		}
		parts.push(`<a href="${RELEASES}">All downloads</a>`);
		note.innerHTML = parts.join(" · ");
	}
}
