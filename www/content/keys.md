---
title: IPAbet — keystroke reference (machine-readable)
description: "The complete IPAbet keystroke-to-IPA mapping as plain-text tables: every base, digraph, diacritic, and rule with explicit keystrokes, glyph, and Unicode codepoint. Raw JSON at /ipabet.json."
---

<p style="color:var(--dim);font-style:italic;font-size:.9rem">Provisional: the layout is still being refined and these keystrokes may change between releases.</p>

The complete keystroke → IPA mapping, generated from the canonical [`ipabet.json`](/ipabet.json) (raw JSON, served verbatim). Notation: `⇧` = Shift, `⌥` = Option; a space separates keystrokes typed in sequence. [Visual chart](/chart) · [home](/).

## Tier 1 · base letters (identity)

Bare Latin keys that are their own IPA value.

<SegTable kind="identity"/>

## Tier 1 · shifted number row

IPA glyphs with no Latin letter.

<SegTable kind="shiftNum"/>

## Tier 1 · digraphs (base + ⇧modifier)

A capital letter after a glyph transforms it. Modifier meanings: <ModifierMeanings/>.

<SegTable kind="digraphs"/>

## Tier 1 · rules (not table-driven)

<RulesTable/>

## Tier 2 · diacritics & suprasegmentals (Option layer)

Combining diacritics are _prefix_, dead-key style like é/ñ on the US keyboard: press ⌥+key, then the base absorbs the mark (⌥n then n → ñ). They stack. Spacing marks (length, tone, stress) are _postfix_ — type the base, then the mark. Where a mark has a second form, ⌥⇧+key gives it (⌥⇧n → creaky, ⌥⇧' → secondary stress). Pressing it a _second_ time commits the raw capital instead — that is the escape, because ⇧ transforms the glyph before it and "GitHub" would otherwise come out "Giθub". Keys with no second form escape on the first press. Backspace cancels a pending mark. Where the two forms are values of the _same dimension_ — advanced/retracted, apical/laminal, syllabic/non-syllabic — the second _replaces_ the first rather than stacking (nothing is both advanced and retracted). Forms on independent dimensions (tilde/creaky, diaeresis/breathy) stack.

<MarkTable kind="ipa"/>

Each ⌥⇧ form is annotated with what ⌥⇧ _means_ for that mark — `greater` pole, more `extreme` value, `lesser` value, same glyph relocated `below`, an independent `twin`, or an `arbitrary` pick between two unpolarized duals. `replaces` marks the pairs that are values of one dimension, where ⌥⇧ replaces instead of stacking. These are per-mark fields in [`ipabet.json`](/ipabet.json).

## Tier 2 · beyond the IPA

Marks the IPA chart has no cell for, kept because the layout should be able to write real orthographies and not only transcribe them. They are fully typeable and stack like any other mark; they are simply absent from [the chart](/chart). Each carries `"ipa": false` and a `beyond` value in the spec.

<BeyondTables/>

## Tier 2 · superscripts (base + ⌥p)

<SupTable/>

## Machine access

`GET /ipabet.schema.json` is the JSON Schema (Draft 2020-12) for `ipabet.json`: every field, its meaning, and the invariants that hold between them (a mark has a `shiftSense` exactly when it has a `double`; `ipa: false` and `beyond` imply each other).

`GET /chart.json` returns the IPA chart as structured data — every symbol with its codepoint, keystrokes, and place/manner or vowel coordinates. `GET /ipabet.json` returns the canonical mapping verbatim (the source of every row above). The `letters` array is the base/digraph list (`key` is the keystroke sequence, `glyph` the output); `marks` is the Option layer; `modifiers` documents each ⇧ modifier's meaning.
