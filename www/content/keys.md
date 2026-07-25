---
title: IPAbet — keystroke reference (machine-readable)
description: "The complete IPAbet keystroke-to-IPA mapping as plain-text tables: every base, digraph, diacritic, and rule with explicit keystrokes, glyph, and Unicode codepoint. Raw JSON at /ipabet.json."
---

The complete keystroke → IPA mapping, generated from the canonical [`ipabet.json`](/ipabet.json) (raw JSON, served verbatim). Notation: `⇧` = Shift, `⌥` = Option, `⌃` = Control; a space separates keystrokes typed in sequence. On Windows and Linux the `⌥` layer is **AltGr** — the right Alt key — mapped 1:1, and `⌥⇧` is AltGr+Shift; keystroke labels across this site follow your platform (the pill in the corner switches spellings). [Visual chart](/chart) · [home](/).

## Base letters (identity)

Bare Latin keys that are their own IPA value.

<SegTable kind="identity"/>

## Number-row bases

IPA glyphs with no Latin letter. The digit is a base, typed **unshifted**, with a modifier after it (`5` `⇧H` → ə, `2` `⇧Q` → ʡ); the roots take `⇧H` — the schwa included: 5 is the center key, and its default is the center vowel. The digit works the other way too: `⇧5` is the **centralize modifier**, pulling a cardinal vowel into the ə-neighborhood (`e` `⇧5` → ɜ, `o` `⇧5` → ɞ, `a` `⇧5` → ɐ). Because the bases sit on the unshifted digit, `⇧2`–`⇧7` stay their native symbols (@ # $ % ^ &) — `⇧5` included, everywhere except right after a bare e, o, or a. Held, a shift-chain uppercases the whole digraph — `⇧5⇧H` → Ə, `⇧7⇧H` → Ħ — the digit's capital plane. The tie bar lives on <kbd>⌥J</kbd> (join); see the Option layer below.

<SegTable kind="shiftNum"/>

## Digraphs (base + ⇧modifier)

A capital letter after a glyph transforms it. Modifier meanings: <ModifierMeanings/>.

<SegTable kind="digraphs"/>

## Extra letters

Latin letters beyond IPA, for writing real orthographies — each typed by doubling a base with its own shift (`s⇧S` → ß, `t⇧T` → þ).

<SegTable kind="extra"/>

## Escapes (getting a literal character back)

`⇧`+letter transforms the glyph before it, so "GitHub" would otherwise come out "Giθub". The ways out, none of which need the IPA layer turned off:

| Keystroke | Effect |
| --- | --- |
| `⌃⇧`+letter | The literal capital. `⌃⇧G ⌃⇧H` is "GH", never ɣ. |
| `⌃⌫` | **Unconvert** — after the fact: the transform before the cursor becomes its literal keystrokes (θ → tH, so "Giθub" repairs to "GitHub" in place). The Japanese IMEs' Ctrl+Backspace. |
| Caps Lock | A **lock**, not a modifier: letters type their literal capitals and never transform (locked `T` then `H` is "TH", not θ). `⇧` still means the modifier while locked. |
| Holding `⇧` | Types capitals. SHIP stays SHIP: **capital digraphs** (`⇧A⇧E` → Æ, `⇧S⇧H` → Ʃ) are an input-menu option, off by default, because they are keystroke-identical to yelling. |
| `⌥⇧1` | `¡` (a deliberate spend). Every other shifted digit types its symbol directly; there is no raw-US digit escape. |
| `⌃Space` | Not IPAbet's key but the off switch: macOS always keeps a plain US layout installed, and the system input-source switcher flips to it — the menu-bar icon shows which keyboard is live. IPAbet has no raw mode of its own; the OS already ships one. |

## Diacritics & suprasegmentals (Option layer)

Combining diacritics are _prefix_, dead-key style like é/ñ on the US keyboard: press `⌥`+key, then the base absorbs the mark (`⌥n` then n → ñ). They stack. Spacing marks (length, tone, stress) are _postfix_. Where a mark has a second form, `⌥⇧`+key gives it (`⌥⇧n` → creaky). Backspace peels a pending mark; Space or Esc commits it as its spacing form. On a glyph already carrying marks, backspace deletes the base and re-arms the marks — they pend again for the next letter (ã ⌫ o → õ). Where the two forms are values of the _same dimension_ — advanced/retracted, apical/laminal — the second _replaces_ the first rather than stacking; forms on independent dimensions stack.

A few keys carry their own behavior: the rhotic hook (`⌥r`) is postfix and fuses `ə`/`ɜ` to precomposed `ɚ`/`ɝ`; the tie joiner (`⌥j` above, `⌥⇧j` below) attaches to the previous segment, or emits the spacing linker (`⁀`/`‿`) when pressed again on the tie it made; a doubled `⌥.` commits the interpunct `·` (Catalan `l·l`).

<MarkTable kind="ipa"/>

Each ⌥⇧ form is annotated with what ⌥⇧ _means_ for that mark — `greater` pole, more `extreme` value, `lesser` value, same glyph relocated `below`, an independent `twin`, or an `arbitrary` pick between two unpolarized duals. `replaces` marks the pairs that are values of one dimension, where ⌥⇧ replaces instead of stacking. These are per-mark fields in [`ipabet.json`](/ipabet.json).

## Beyond IPA

Marks the IPA chart has no cell for, kept because the layout should be able to write real orthographies and not only transcribe them. They are fully typeable and stack like any other mark; they are simply absent from [the chart](/chart). Each carries `"ipa": false` and a `beyond` value in the spec.

<BeyondTables/>

## Superscripts (⌥z + base)

⌥z arms the raise and the next glyph arrives raised (`t` ⌥z `h` → tʰ) — a prefix, like the ⌥ diacritics, previewing as `⁻`. A glyph that is already raised still transforms, so a digraph works: ⌥z `s` ⇧H → ᶴ. Generated from Unicode's `<super>` decompositions, plus the raised letters Unicode gives no decomposition. Where no raised form exists the arm lifts and the glyph lands plain.

<SupTable/>

## Subscripts (⌥⇧z + base)

The lowered twin, on the shifted operator, and prefix the same way: ⌥⇧z then the glyph (`x` ⌥⇧z `2` → x₂), previewing as `₋`. Generated the same way from `<sub>` decompositions — digits and the handful of letters Unicode lowers.

<SubTable/>

## Cycles (press again)

A combining key may carry a **cycle**: pressing it again on its own pending mark advances through a family and wraps, every step visible in the composition preview — ⌫ cancels. Cycles hold one dimension only; marks from different dimensions keep separate keys so they can stack (dental + laminal = t̪̻).

| Key | Family |
| --- | --- |
| `⌥n ⌥n`… | ◌̃ nasalized → ◌͊ denasal → ◌͋ nasal escape → ◌͌ velopharyngeal |
| `⌥w ⌥w`… | ◌̜ less rounded → ◌͍ labial spreading |
| `⌥⇧w ⌥⇧w`… | ◌̹ more rounded → ◌͎ whistled |

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

On macOS pick it in the input menu (Quote Style); on the web editor, the picker. The grapheme brackets live beside them: <kbd>⌥\</kbd> ⟨ and <kbd>⌥⇧\</kbd> ⟩ — linguistics' third citation bracket (/phoneme/ [phone] ⟨grapheme⟩).

## Machine access

`GET /ipabet.schema.json` is the JSON Schema (Draft 2020-12) for `ipabet.json`: every field, its meaning, and the invariants that hold between them (a mark has a `shiftSense` exactly when it has a `double`; `ipa: false` and `beyond` imply each other).

`GET /chart.json` returns the IPA chart as structured data — every symbol with its codepoint, keystrokes, and place/manner or vowel coordinates. `GET /ipabet.json` returns the canonical mapping verbatim (the source of every row above). The `letters` array is the base/digraph list (`key` is the keystroke sequence, `glyph` the output); `marks` is the Option layer; `modifiers` documents each ⇧ modifier's meaning.
