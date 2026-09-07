// Which machine this is running on. The pure half, safe to import anywhere and
// the single place the question is asked — keystroke labels collapse the answer
// to two spellings, the download link wants all three and the architecture too.

export type Platform = "macos" | "windows" | "linux";

export interface Target {
	platform: Platform;
	/** Linux on ARM wants a different package, and nothing else here cares. */
	arm: boolean;
}

/**
 * Reads the platform out of whatever the browser is willing to say. Returns
 * null when the answer is not one of the three, which covers Android, unknown
 * agents, and the server — all of which should keep the neutral markup rather
 * than be told they are on something they are not.
 */
export function readTarget(hints: {
	platform?: string;
	userAgent?: string;
}): Target | null {
	const platform = hints.platform ?? "";
	const agent = hints.userAgent ?? "";
	const both = `${platform} ${agent}`;

	// Android reports Linux and has nothing here to install, so it is checked
	// first and dropped.
	if (/android/i.test(both)) return null;
	if (/win/i.test(both)) {
		return {platform: "windows", arm: /aarch64|arm64/i.test(both)};
	}
	if (/mac|iphone|ipad|ipod/i.test(both)) return {platform: "macos", arm: false};
	if (/linux|x11|cros/i.test(both)) {
		return {platform: "linux", arm: /aarch64|arm64|armv/i.test(both)};
	}
	return null;
}

/** The running machine, or null when it is not one this ships for. */
export function detectTarget(): Target | null {
	if (typeof navigator === "undefined") return null;
	const data = (navigator as {userAgentData?: {platform?: string}}).userAgentData;
	return readTarget({
		// navigator.platform is deprecated and still the only sync way to learn
		// that a Linux box is ARM, which decides which package it needs.
		platform: data?.platform ?? navigator.platform,
		userAgent: navigator.userAgent,
	});
}

/**
 * The sync answer lies on Windows-on-ARM: Chromium's frozen UA claims x64,
 * and the architecture only comes from the async high-entropy client hint.
 * Resolves to the corrected target (or the input unchanged) so callers can
 * re-render; macOS and Linux answers pass through untouched.
 */
export async function refineTarget(target: Target | null): Promise<Target | null> {
	if (!target || target.platform !== "windows" || target.arm) return target;
	const data = (
		navigator as {
			userAgentData?: {getHighEntropyValues?: (h: string[]) => Promise<{architecture?: string}>};
		}
	).userAgentData;
	if (!data?.getHighEntropyValues) return target;
	try {
		const {architecture} = await data.getHighEntropyValues(["architecture"]);
		if (architecture && /arm/i.test(architecture)) return {...target, arm: true};
	} catch {
		// The hint being refused is the same as it not existing.
	}
	return target;
}

/** Where a given machine's build lives, matching the routes in server.ts. */
export function downloadPath(target: Target): string {
	switch (target.platform) {
		case "windows":
			return target.arm ? "/download/windows/arm64" : "/download/windows";
		case "linux":
			return target.arm ? "/download/linux/arm64" : "/download/linux";
		default:
			return "/download/macos";
	}
}

/** What that build is called, so a download link can say what it hands over. */
export function downloadName(target: Target): string {
	switch (target.platform) {
		case "windows":
			return target.arm ? "IPAbet-arm64.msi" : "IPAbet-x64.msi";
		case "linux":
			return target.arm ? "ipabet-ibus-arm64.deb" : "ipabet-ibus-amd64.deb";
		default:
			return "IPAbet.pkg";
	}
}
