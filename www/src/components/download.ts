// The hero's three doors, and the line under them naming what you will get.
//
// Rendered on the server with no target, because the page is CDN-cached and one
// visitor's machine is not the next one's. clients/download-client.ts hydrates
// the same component with the machine it is actually running on.
//
// Without a target this still works: the button points at /download, which
// redirects by User-Agent, and the line offers the full list. Scripting off
// costs a redirect hop and the file name, nothing else.

import {jsx} from "@b9g/crank/standalone";
import {downloadName, downloadPath, type Target} from "../clients/platform.ts";

const RELEASES = "https://github.com/bikeshaving/ipabet/releases/latest";

const OS_NAME: Record<Target["platform"], string> = {
	macos: "macOS",
	windows: "Windows",
	linux: "Linux",
};

/** The same machine with the other processor. macOS ships one file for both. */
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

export interface DownloadsProps {
	/** The machine, once something knows it. Null on the server. */
	target?: Target | null;
}

export function Downloads({target = null}: DownloadsProps) {
	const other = target ? sibling(target) : null;
	return jsx`
		<div class="doors">
			<nav class="callouts">
				<a class="main" href=${target ? downloadPath(target) : "/download"}>
					Download for ${target ? OS_NAME[target.platform] : "macOS"}
				</a>
				<a href="/type">Type in your browser</a>
				<a href="/learn">Learn it in an afternoon</a>
			</nav>
			<p class="download-note">
				${target && jsx`<code>${downloadName(target)}</code> · `}
				${
					// The processor is the one thing no browser reports reliably:
					// the only Windows API for it is Chromium-only, and a browser
					// emulated on an ARM machine calls itself x86. So the other
					// file is offered outright rather than guessed at.
					other &&
					jsx`${siblingLabel(target!)} ${" "}
						<a href=${downloadPath(other)}>${downloadName(other)}</a> · `
				}
				<a href=${RELEASES}>All downloads</a>
			</p>
		</div>
	`;
}
