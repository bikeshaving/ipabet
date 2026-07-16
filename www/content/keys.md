---
title: IPAbet — keystroke reference (machine-readable)
description: "The complete IPAbet keystroke-to-IPA mapping as plain-text tables: every base, digraph, diacritic, and rule with explicit keystrokes, glyph, and Unicode codepoint. Raw JSON at /ipabet.json."
---

<p style="color:var(--dim);font-style:italic;font-size:.9rem">Provisional: the layout is still being refined and these keystrokes may change between releases.</p>

The complete keystroke → IPA mapping, generated from the canonical [`ipabet.json`](/ipabet.json) (raw JSON, served verbatim). Notation: `⇧` = Shift, `⌥` = Option, `⌃` = Control; a space separates keystrokes typed in sequence. [Visual chart](/chart) · [home](/).

## Tier 1 · base letters (identity)

Bare Latin keys that are their own IPA value.

<SegTable kind="identity"/>

## Tier 1 · number-row bases

IPA glyphs with no Latin letter. The digit is a base, typed **unshifted**, with a modifier after it (`5` `⇧Y` → ə, `5` `⇧H` → ɜ, `2` `⇧Q` → ʡ); the roots take `⇧H`, or `⇧Y` on the schwa. Because they sit on the unshifted digit, ⇧2–7 are all their native symbols now (@ # $ % ^ &). The tie bar — the one combining joiner — left the number row for <kbd>⌥J</kbd> (join); see the Option layer below.

<SegTable kind="shiftNum"/>

## Tier 1 · digraphs (base + ⇧modifier)

A capital letter after a glyph transforms it. Modifier meanings: <ModifierMeanings/>.

<SegTable kind="digraphs"/>

## Tier 1 · rules (not table-driven)

<RulesTable/>

## Tier 1 · escapes (getting a literal character back)

⇧+letter transforms the glyph before it, so "GitHub" would otherwise come out "Giθub". Three ways out, none of which need the IPA layer turned off:

| Keystroke | Effect |
| --- | --- |
| ⌃⇧+letter | The literal capital. `⌃⇧G ⌃⇧H` is "GH", never ɣ. |
| Caps Lock | A **lock**, not a modifier: letters type their literal capitals and never transform (locked `T` then `H` is "TH", not θ). ⇧ still means the modifier while locked. |
| ⌥⇧1 | `¡` (a deliberate spend). Every other shifted digit types its symbol directly now, so the raw-US digit escape is retired. |
| ⌥⇧Space | The **Raw-US Lock**: the whole keyboard goes native until pressed again. |

## Tier 2 · diacritics & suprasegmentals (Option layer)

Combining diacritics are _prefix_, dead-key style like é/ñ on the US keyboard: press ⌥+key, then the base absorbs the mark (⌥n then n → ñ). They stack. Spacing marks (length, tone, stress) are _postfix_ — type the base, then the mark. Where a mark has a second form, ⌥⇧+key gives it (⌥⇧n → creaky, ⌥⇧' → secondary stress). Backspace cancels a pending mark. Where the two forms are values of the _same dimension_ — advanced/retracted, apical/laminal, syllabic/non-syllabic — the second _replaces_ the first rather than stacking (nothing is both advanced and retracted). Forms on independent dimensions (tilde/creaky, diaeresis/breathy) stack.

<MarkTable kind="ipa"/>

Each ⌥⇧ form is annotated with what ⌥⇧ _means_ for that mark — `greater` pole, more `extreme` value, `lesser` value, same glyph relocated `below`, an independent `twin`, or an `arbitrary` pick between two unpolarized duals. `replaces` marks the pairs that are values of one dimension, where ⌥⇧ replaces instead of stacking. These are per-mark fields in [`ipabet.json`](/ipabet.json).

## Tier 2 · beyond the IPA

Marks the IPA chart has no cell for, kept because the layout should be able to write real orthographies and not only transcribe them. They are fully typeable and stack like any other mark; they are simply absent from [the chart](/chart). Each carries `"ipa": false` and a `beyond` value in the spec.

<BeyondTables/>

## Tier 2 · superscripts (base + ⌥z)

Type a glyph, then ⌥z to raise it — one press per glyph (`t` `h` ⌥z → tʰ). The table is generated from Unicode's `<super>` decompositions, so a glyph raises only where Unicode defines the form.

<SupTable/>

## Tier 2 · subscripts (base + ⌥⇧z)

The lowered twin, on the shifted operator: a glyph, then ⌥⇧z (`x` `2` ⌥⇧z → x₂). Generated the same way from `<sub>` decompositions — digits and the handful of letters Unicode lowers.

<SubTable/>

## Tier 2 · cycles (press again)

A combining key may carry a **cycle**: pressing it again on its own pending mark advances through a family and wraps, every step visible in the composition preview — ⌫ cancels. Cycles hold one dimension only; marks from different dimensions keep separate keys so they can stack (dental + laminal = t̪̻).

| Key | Family |
| --- | --- |
| ⌥n ⌥n… | ◌̃ nasalized → ◌͊ denasal → ◌͋ nasal escape → ◌͌ velopharyngeal |
| ⌥w ⌥w… | ◌̜ less rounded → ◌͍ labial spreading |
| ⌥⇧w ⌥⇧w… | ◌̹ more rounded → ◌͎ whistled |
| ⌥j ⌥j | the same joiner chord again toggles the emitted tie ⇄ ◌͢ sliding; the other chord flips placement |

## Quotes by locale

The bracket keys are semantic: <kbd>⌥[</kbd> opens the **primary** quote, <kbd>⌥⇧[</kbd> closes it; <kbd>⌥]</kbd>/<kbd>⌥⇧]</kbd> are the **secondary** pair. Which characters they emit is the *quote locale* (default `en`):

| Locale | Primary | Secondary |
| --- | --- | --- |
| en | “ ” | ‘ ’ |
| de | „ “ | ‚ ‘ |
| fr | « » | ‹ › |
| ch | » « | › ‹ |
| pl | „ ” | « » |
| ru | « » | „ “ |
| sv | ” ” | ’ ’ |

On macOS set it with the IME's `quoteLocale` default; on the web editor, the picker. The grapheme brackets live beside them: <kbd>⌥\</kbd> ⟨ and <kbd>⌥⇧\</kbd> ⟩ — linguistics' third citation bracket (/phoneme/ [phone] ⟨grapheme⟩).

## Machine access

`GET /ipabet.schema.json` is the JSON Schema (Draft 2020-12) for `ipabet.json`: every field, its meaning, and the invariants that hold between them (a mark has a `shiftSense` exactly when it has a `double`; `ipa: false` and `beyond` imply each other).

`GET /chart.json` returns the IPA chart as structured data — every symbol with its codepoint, keystrokes, and place/manner or vowel coordinates. `GET /ipabet.json` returns the canonical mapping verbatim (the source of every row above). The `letters` array is the base/digraph list (`key` is the keystroke sequence, `glyph` the output); `marks` is the Option layer; `modifiers` documents each ⇧ modifier's meaning.
