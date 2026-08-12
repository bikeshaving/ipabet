// Which build a machine gets. The download link names a file, and naming the
// wrong one is worse than naming none — so anything unrecognised returns null
// and keeps the neutral markup.

import {describe, expect, test} from "bun:test";
import {downloadName, downloadPath, readTarget} from "../src/clients/platform.ts";

describe("readTarget", () => {
	test("the three platforms it ships for", () => {
		expect(readTarget({platform: "MacIntel"})?.platform).toBe("macos");
		expect(readTarget({platform: "Win32"})?.platform).toBe("windows");
		expect(readTarget({platform: "Linux x86_64"})?.platform).toBe("linux");
	});

	test("userAgentData spellings", () => {
		expect(readTarget({platform: "macOS"})?.platform).toBe("macos");
		expect(readTarget({platform: "Windows"})?.platform).toBe("windows");
		expect(readTarget({platform: "Linux"})?.platform).toBe("linux");
	});

	test("ARM Linux wants a different package", () => {
		expect(readTarget({platform: "Linux aarch64"})).toEqual({platform: "linux", arm: true});
		expect(readTarget({platform: "Linux x86_64"})).toEqual({platform: "linux", arm: false});
	});

	test("Android reports Linux and has nothing to install", () => {
		expect(readTarget({userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile"})).toBeNull();
	});

	test("iPhones and iPads read as macOS, which is where the link points", () => {
		expect(readTarget({platform: "iPhone"})?.platform).toBe("macos");
	});

	test("nothing recognisable stays neutral", () => {
		expect(readTarget({})).toBeNull();
		expect(readTarget({userAgent: "curl/8.4.0"})).toBeNull();
	});
});

describe("download targets", () => {
	test("paths match the routes the server serves", () => {
		expect(downloadPath({platform: "macos", arm: false})).toBe("/download/macos");
		expect(downloadPath({platform: "windows", arm: false})).toBe("/download/windows");
		expect(downloadPath({platform: "linux", arm: false})).toBe("/download/linux");
		expect(downloadPath({platform: "linux", arm: true})).toBe("/download/linux/arm64");
	});

	test("names match the files the release attaches", () => {
		expect(downloadName({platform: "macos", arm: false})).toBe("IPAbet.pkg");
		expect(downloadName({platform: "windows", arm: false})).toBe("IPAbet.msi");
		expect(downloadName({platform: "linux", arm: true})).toBe("ipabet-ibus-arm64.deb");
	});
});
