---
title: "IPAbet: type the IPA at typing speed"
description: "I built a keyboard that types the International Phonetic Alphabet like a language you already know — here's the notation, the five constraints, and the three fights that shaped it."
date: "2026-07-17"
draft: true
---

The name of the ǃXóõ language takes six keystrokes: <Combo keys="q ⇧C" out="ǃ"/> <Combo keys="⇧X" out="X" plain/> <Combo keys="⌥e o" out="ó"/> <Combo keys="⌥n o" out="õ"/>. A click, a capital, two accented vowels — no palette, no picker, no codes, at the speed you type English. That's the whole pitch. [IPAbet](/) is a keyboard — a real macOS input method, with the same engine running in [any browser](/type) — that treats the International Phonetic Alphabet as something you *type* rather than something you *insert*.

## A linguist's keyboard, not a lawyer's keyboard

Every key placement in IPAbet had to argue for its life in phonetic terms. Somewhere mid-design I noticed the Option layer filling up with the usual suspects — © ™ ° ‰ … — and none of them could say what they were *for*. They were squatting on keys a linguist needs. That became the organizing principle: this is not a lawyer's keyboard. The ejective lives on the guttural key. The nasal marks stack behind ⌥n and cycle on repeat press. The whistled-speech mark sits at the far end of the rounding cycle, because whistling is the most rounding you can have. If a mark couldn't state its claim, it lost the key.

The notation itself follows five constraints, ranked — identity preservation, a hard two-keystroke bound, local determinism, a phonetic operator algebra, and reuse of conventions you already know (pinyin, the Arabic chat alphabet, English spelling). The full argument is on [/design](/design); the compressed version is that <Combo keys="s ⇧H" out="ʃ"/> works because ⇧H *means* something — it lenites — and the same ⇧H gives you <Combo keys="t ⇧H" out="θ"/> and <Combo keys="i ⇧H" out="ɪ"/> for the same reason. It's a grammar you read, not a table you memorize.

## Three fights worth retelling

**The capital theta.** Held-shift capitals form digraphs — ⇧A⇧E → Æ — and for a long time Greek results were blocked so that "THE" stayed typeable. But SHE already formed Ʃ; the guard protected nothing consistently. So now ⇧T⇧H → Θ, and the price is stated in the tests, not hidden: type $PATH under held shift and you get ɾPAΘ. All-caps words belong to Caps Lock. A keyboard this dense is honest about its tradeoffs or it is lying somewhere.

**The raw mode that died to a fact.** IPAbet shipped a "Raw-US Lock" — a toggle that made the whole keyboard native for code and terminals. Then we tried to delete the US layout from the input menu and couldn't: macOS *requires* a plain layout to exist, because password fields disable input methods entirely. Which means the OS already ships a raw mode, with a better indicator than anything I could build — the input-source icon itself. The feature was deleted the same evening. The best code is the code the operating system was already running.

**The Catalan L.** l⇧L used to emit the ela geminada trigraph l·l — the only rule in the layout that produced a *string* instead of a glyph, and its capital was unreachable. It got evicted, and the interpunct found its true home: a double press on the dot key. <Combo keys="l ⌥. ⌥. l" out="l·l"/>. The dot key's free-floating form, discovered by asking "is there not a dot somewhere?"

## The name

IPAbet is a deliberate echo of [ARPAbet](https://en.wikipedia.org/wiki/ARPABET), the ASCII phonetic alphabet from the first era of speech research. ARPAbet and X-SAMPA were how you typed phonetics on keyboards that couldn't; IPAbet is the same practical instinct, except it emits the real thing — every symbol is its true Unicode codepoint, searchable and fontable.

## Trust, enforced

An input method sees every keystroke you type, so IPAbet doesn't ask you to trust it: the app is sandboxed with **zero network entitlements**, which means macOS itself refuses it a socket. "Fully offline" is not a promise in a README; it's an OS-enforced fact. And it's open source, so you can check both claims.

## 0.1.0, and a covenant

This is release 0.1.0 — SemVer's honest number for a layout that may still move. The covenant comes at 1.0.0: from then on, keystrokes are append-only, the way Unicode never reassigns a codepoint. Linguists keep layouts for decades; the first number that promises your muscle memory is safe should be the one that means it.

Until then: [the chart](/chart) is one printable page, [/learn](/learn) teaches the layout to your fingers in an afternoon, and [/type](/type) runs the full engine in your browser right now — AltGr and all, if you're on Windows or Linux. Go type something unpronounceable.
