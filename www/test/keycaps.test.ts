// The PC spelling of the keystroke notation. Labels are data (curricula, the
// spec, chart datasets all store ⌥⇧⌃); pcKeys is the one display-time
// translation, so its edge cases are the whole platform-labels feature.

import {describe, expect, test} from "bun:test";
import {pcKeys} from "../src/keycaps.ts";

describe("pcKeys", () => {
	test("modifier runs spell out, joined with +", () => {
		expect(pcKeys("⇧H")).toBe("Shift+H");
		expect(pcKeys("⌥n")).toBe("AltGr+n");
		expect(pcKeys("⌥⇧w")).toBe("AltGr+Shift+w");
		expect(pcKeys("⌃⇧Space")).toBe("Ctrl+Shift+Space");
	});

	test("sequences translate per keystroke, spaces intact", () => {
		expect(pcKeys("s ⇧H")).toBe("s Shift+H");
		expect(pcKeys("5 ⇧Y")).toBe("5 Shift+Y");
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
