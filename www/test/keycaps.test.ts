// The PC spelling of the keystroke notation. Labels are data (curricula, the
// spec, chart datasets all store ⌥⇧⌃); pcKeys is the one display-time
// translation, so its edge cases are the whole platform-labels feature.

import {describe, expect, test} from "bun:test";
import {pcKeys} from "../src/clients/keycaps.ts";

describe("pcKeys", () => {
	test("modifier runs spell out, joined with +", () => {
		expect(pcKeys("⇧H")).toBe("Shift+H");
		expect(pcKeys("⌥n")).toBe("Alt+n");
		expect(pcKeys("⌥⇧w")).toBe("Alt+Shift+w");
		expect(pcKeys("⌃⇧G")).toBe("Ctrl+Shift+G");
	});

	test("sequences translate per keystroke, spaces intact", () => {
		expect(pcKeys("s ⇧H")).toBe("s Shift+H");
		expect(pcKeys("5 ⇧H")).toBe("5 Shift+H");
		expect(pcKeys("⌥n ⌥n")).toBe("Alt+n Alt+n");
	});

	test("a bare modifier is the bare word — the on-screen keyboard caps", () => {
		expect(pcKeys("⇧")).toBe("Shift");
		expect(pcKeys("⌥")).toBe("Alt");
		expect(pcKeys("⌥⇧")).toBe("Alt+Shift");
	});

	test("punctuation keys ride along", () => {
		expect(pcKeys("⌥⇧'")).toBe("Alt+Shift+'");
		expect(pcKeys("⌥[")).toBe("Alt+[");
		expect(pcKeys("⌥\\")).toBe("Alt+\\");
	});

	test("surrounding prose survives untouched", () => {
		expect(pcKeys("…any base + ⌥⇧q")).toBe("…any base + Alt+Shift+q");
		expect(pcKeys("no modifiers here")).toBe("no modifiers here");
	});
});
