// The PC spelling of the keystroke notation. Labels are data (curricula, the
// spec, chart datasets all store ⌥⇧⌃); pcKeys is the one display-time
// translation, so its edge cases are the whole platform-labels feature.

import {describe, expect, test} from "bun:test";
import {pcKeys, pcKeysCompact, optLabel} from "../src/clients/keycaps.ts";

describe("optLabel", () => {
	test("the ⌥ layer is Alt off the Mac", () => {
		expect(optLabel()).toBe("Alt");
	});
});

describe("pcKeys", () => {
	test("modifier runs spell out, joined with +", () => {
		expect(pcKeys("⇧H")).toBe("Shift+H");
		expect(pcKeys("⌥n")).toBe("Alt+n");
		expect(pcKeys("⌥⇧w")).toBe("Alt+Shift+w");
		expect(pcKeys("⌃⇧G")).toBe("Ctrl+Shift+G");
	});

	test("the Linux spelling of the ⌥ layer", () => {
		expect(pcKeys("⌥n", "Alt")).toBe("Alt+n");
		expect(pcKeys("⌥⇧w", "Alt")).toBe("Alt+Shift+w");
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

	test("a modifier glued to its base gets a space", () => {
		expect(pcKeys("s⇧H")).toBe("s Shift+H");
		expect(pcKeys("q⇧C⇧C")).toBe("q Shift+C Shift+C");
		expect(pcKeys("t ⌥j s⇧H")).toBe("t Alt+j s Shift+H");
		expect(pcKeys("(s⇧H)")).toBe("(s Shift+H)");
	});

	test("⌘ is Ctrl off the Mac", () => {
		expect(pcKeys("⌘P")).toBe("Ctrl+P");
	});

	test("surrounding prose survives untouched", () => {
		expect(pcKeys("…any base + ⌥⇧q")).toBe("…any base + Alt+Shift+q");
		expect(pcKeys("no modifiers here")).toBe("no modifiers here");
	});
});

describe("pcKeysCompact", () => {
	test("only the ⌥ key is renamed", () => {
		expect(pcKeysCompact("⌥⇧k")).toBe("Alt+⇧k");
		expect(pcKeysCompact("⌥e")).toBe("Alt+e");
		expect(pcKeysCompact("s⇧H")).toBe("s⇧H");
		expect(pcKeysCompact("t ⌥j s")).toBe("t Alt+j s");
		expect(pcKeysCompact("⌥e ⌥⇧e", "Alt")).toBe("Alt+e Alt+⇧e");
	});

	test("a bare ⌥ is the key's name", () => {
		expect(pcKeysCompact("⌥")).toBe("Alt");
	});
});
