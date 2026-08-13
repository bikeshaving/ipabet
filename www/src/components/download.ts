// The download widget, and the two doors beside it.
//
// Rendered on the server with no target, because the page is CDN-cached and one
// visitor's machine is not the next one's. clients/download-client.ts hydrates
// the same component with the machine it is actually running on.
//
// The platform row is tabs, not links to other files: picking Linux on a Mac
// means "show me the Linux download", not "download it now". Only the button
// downloads. With scripting off the tabs are ordinary links to the same
// per-platform paths, which is that destination one step earlier.

import {jsx} from "@b9g/crank/standalone";
import type {Context} from "@b9g/crank/standalone";
import {downloadName, downloadPath, type Platform, type Target} from "../clients/platform.ts";

const RELEASES = "https://github.com/bikeshaving/ipabet/releases/latest";

const OS_NAME: Record<Platform, string> = {
	macos: "macOS",
	windows: "Windows",
	linux: "Linux",
};

/** The builds of a platform, named as the machine's own settings name them.
 *  macOS ships one file for both processors, so the row states the thing that
 *  does exclude people instead: the package is built against macOS 13. Either
 *  way the card keeps its shape whichever tab is showing. */
const ARCHES: Record<Platform, {label: string; arm: boolean}[]> = {
	macos: [{label: "macOS 13 and later", arm: false}],
	windows: [{label: "Intel or AMD", arm: false}, {label: "ARM", arm: true}],
	linux: [{label: "Intel or AMD", arm: false}, {label: "ARM", arm: true}],
};

// Drawn rather than borrowed. An Apple or Windows logo is a trademark, and what
// a reader needs here is only "which machine is this" — a laptop, a window, a
// penguin. Plain shapes on a 16-unit grid, inheriting the text color.
function Icon({platform}: {platform: Platform}) {
	const body = {
		// A laptop: screen, then the base it sits on.
		macos: jsx`
			<rect x="2.5" y="3" width="11" height="7.5" rx="1.2"
				fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M1 12.6h14a1.4 1.4 0 0 1-1.4 1.4H2.4A1.4 1.4 0 0 1 1 12.6Z"
				fill="currentColor" />`,
		// A window, four panes.
		windows: jsx`
			<rect x="2" y="2.6" width="5.2" height="5.2" rx="0.6" fill="currentColor" />
			<rect x="8.8" y="2.6" width="5.2" height="5.2" rx="0.6" fill="currentColor" />
			<rect x="2" y="8.2" width="5.2" height="5.2" rx="0.6" fill="currentColor" />
			<rect x="8.8" y="8.2" width="5.2" height="5.2" rx="0.6" fill="currentColor" />`,
		// A penguin: body, head, eyes, beak, belly, feet.
		linux: jsx`
			<ellipse cx="8" cy="9.4" rx="4" ry="4.6" fill="currentColor" />
			<circle cx="8" cy="4.6" r="3" fill="currentColor" />
			<circle cx="6.9" cy="4.3" r="0.75" fill="var(--card)" />
			<circle cx="9.1" cy="4.3" r="0.75" fill="var(--card)" />
			<path d="M8 5.4 9.1 6.4 8 7 6.9 6.4Z" fill="var(--card)" />
			<ellipse cx="8" cy="10.4" rx="2.2" ry="3" fill="var(--card)" />
			<path d="M4.6 14.2 6.6 13.2h.7l-.6 1.4Zm6.8 0-2-1h-.7l.6 1.4Z" fill="currentColor" />`,
	}[platform];

	return jsx`
		<svg class="os-icon" viewBox="0 0 16 16" width="16" height="16"
			aria-hidden="true" focusable="false">${body}</svg>`;
}

const ORDER: Platform[] = ["macos", "windows", "linux"];

export interface DownloadsProps {
	/** The machine, once something knows it. Null on the server. */
	target?: Target | null;
}

export function* Downloads(this: Context, {target}: DownloadsProps) {
	// What the tabs are showing. It starts at the detected machine and moves
	// only when someone picks a tab — after which detection stops overriding it,
	// since the visitor has said what they want more clearly than the browser can.
	let shown: Target = target ?? {platform: "macos", arm: false};
	let picked = false;

	const show = (next: Target) => (event: Event) => {
		event.preventDefault();
		this.refresh(() => {
			shown = next;
			picked = true;
		});
	};

	for ({target} of this) {
		if (target && !picked) shown = target;
		const arches = ARCHES[shown.platform];
		const oneBuild = arches.length === 1;

		yield jsx`
			<div class="doors">
				<div class="download">
					<a class="download-get" href=${downloadPath(shown)}>
						<${Icon} platform=${shown.platform} />
						Download for ${OS_NAME[shown.platform]}
					</a>

					<p class="download-file">${downloadName(shown)}</p>

					<div class="download-arch" role="group"
						aria-label=${oneBuild ? "What this build runs on" : "Processor"}>
						${
							// The processor, as a choice rather than a question. No browser
							// reports it honestly: the only Windows API for it is
							// Chromium-only, and a browser emulated on an ARM machine
							// calls itself x86. Where there is only one build the same
							// row states which processors it covers.
							arches.map(({label, arm}) =>
								oneBuild
									? jsx`<span aria-current="true">${label}</span>`
									: jsx`
										<a href=${downloadPath({platform: shown.platform, arm})}
											aria-current=${shown.arm === arm ? "true" : undefined}
											onclick=${show({platform: shown.platform, arm})}
										>${label}</a>`,
							)
						}
					</div>

					<ul class="download-all">
						${ORDER.map(
							(platform) => jsx`
								<li>
									<a href=${downloadPath({platform, arm: false})}
										aria-current=${platform === shown.platform ? "true" : undefined}
										onclick=${show({
											platform,
											arm: platform === shown.platform ? shown.arm : false,
										})}
									><${Icon} platform=${platform} />${OS_NAME[platform]}</a>
								</li>`,
						)}
						<li class="download-releases"><a href=${RELEASES}>All files</a></li>
					</ul>
				</div>

				<nav class="callouts">
					<a href="/type">Type in your browser</a>
					<a href="/learn">Learn it in an afternoon</a>
				</nav>
			</div>
		`;
	}
}
