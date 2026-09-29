// The PC spelling of the keystroke notation. Labels are data (curricula, the
// spec, chart datasets all store ⌥⇧⌃); pcKeys is the one display-time
// translation, so its edge cases are the whole platform-labels feature.

import {describe, expect, test} from "bun:test";
import {pcKeys, optLabel} from "../src/clients/keycaps.ts";

describe("optLabel", () => {
	test("the ⌥ layer is Alt off the Mac", () => {
		expect(optLabel()).toBe("Alt");
	});
});

describe("pcKeys", () => {
	test("only the keys a PC keyboard doesn't print are renamed", () => {
		expect(pcKeys("⌥n")).toBe("Alt+n");
		expect(pcKeys("⌥⇧w")).toBe("Alt+⇧w");
		expect(pcKeys("⌃⇧G")).toBe("Ctrl+⇧G");
		expect(pcKeys("⌘P")).toBe("Ctrl+P");
	});

	test("⇧ stays, glued or spaced", () => {
		expect(pcKeys("⇧H")).toBe("⇧H");
		expect(pcKeys("s⇧H")).toBe("s⇧H");
		expect(pcKeys("s ⇧H")).toBe("s ⇧H");
		expect(pcKeys("q⇧C⇧C")).toBe("q⇧C⇧C");
	});

	test("sequences translate per keystroke, spaces intact", () => {
		expect(pcKeys("t ⌥j s⇧H")).toBe("t Alt+j s⇧H");
		expect(pcKeys("⌥n ⌥n")).toBe("Alt+n Alt+n");
		expect(pcKeys("⌥e ⌥⇧e")).toBe("Alt+e Alt+⇧e");
	});

	test("a bare modifier is its name — the on-screen keyboard caps", () => {
		expect(pcKeys("⌥")).toBe("Alt");
		expect(pcKeys("⌥⇧")).toBe("Alt+⇧");
		expect(pcKeys("⇧")).toBe("⇧");
	});

	test("punctuation keys ride along", () => {
		expect(pcKeys("⌥⇧'")).toBe("Alt+⇧'");
		expect(pcKeys("⌥[")).toBe("Alt+[");
		expect(pcKeys("⌥\\")).toBe("Alt+\\");
	});

	test("surrounding prose survives untouched", () => {
		expect(pcKeys("…any base + ⌥⇧q")).toBe("…any base + Alt+⇧q");
		expect(pcKeys("(⌥e)")).toBe("(Alt+e)");
		expect(pcKeys("no modifiers here")).toBe("no modifiers here");
	});
});
