// The PC spelling of the keystroke notation. Labels are data (curricula, the
// spec, chart datasets all store ⌥⇧⌃); pcKeys is the one display-time
// translation, so its edge cases are the whole platform-labels feature.

import {describe, expect, test} from "bun:test";
import {pcKeys, optLabel} from "../src/clients/keycaps.ts";

describe("optLabel", () => {
	test("the ⌥ layer is AltGr on Windows and a plain Alt on Linux", () => {
		expect(optLabel("windows")).toBe("AltGr");
		expect(optLabel("linux")).toBe("Alt");
		expect(optLabel("mac")).toBe("AltGr");
	});
});

describe("pcKeys", () => {
	test("modifier runs spell out, joined with +", () => {
		expect(pcKeys("⇧H")).toBe("Shift+H");
		expect(pcKeys("⌥n")).toBe("AltGr+n");
		expect(pcKeys("⌥⇧w")).toBe("AltGr+Shift+w");
		expect(pcKeys("⌃⇧G")).toBe("Ctrl+Shift+G");
	});

	test("the Linux spelling of the ⌥ layer", () => {
		expect(pcKeys("⌥n", "Alt")).toBe("Alt+n");
		expect(pcKeys("⌥⇧w", "Alt")).toBe("Alt+Shift+w");
	});

	test("sequences translate per keystroke, spaces intact", () => {
		expect(pcKeys("s ⇧H")).toBe("s Shift+H");
		expect(pcKeys("5 ⇧H")).toBe("5 Shift+H");
		expect(pcKeys("⌥n ⌥n")).toBe("AltGr+n AltGr+n");
	});

	test("a bare modifier is the bare word — the on-screen keyboard caps", () => {
		expect(pcKeys("⇧")).toBe("Shift");
		expect(pcKeys("⌥")).toBe("AltGr");
		expect(pcKeys("⌥⇧")).toBe("AltGr+Shift");
	});

	test("punctuation keys ride along", () => {
		expect(pcKeys("⌥⇧'")).toBe("AltGr+Shift+'");
		expect(pcKeys("⌥[")).toBe("AltGr+[");
		expect(pcKeys("⌥\\")).toBe("AltGr+\\");
	});

	test("surrounding prose survives untouched", () => {
		expect(pcKeys("…any base + ⌥⇧q")).toBe("…any base + AltGr+Shift+q");
		expect(pcKeys("no modifiers here")).toBe("no modifiers here");
	});
});
