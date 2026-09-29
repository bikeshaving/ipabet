---
title: "IPA keystroke reference | IPAbet"
description: "Every IPAbet keystroke as tables: letters, digraphs, diacritics, superscripts and subscripts, with Unicode codepoints."
---

Every keystroke, as tables. ⇧ is Shift, ⌥ is Option (Alt on Windows and Linux), and a space separates keys pressed one after another.

## Base letters

Plain keys that type themselves.

<SegTable kind="identity"/>

## Number-row bases

IPA letters with no Latin letter start from a digit: `5` `⇧H` → ə. After e, o or a, `⇧5` centralizes the vowel: `e` `⇧5` → ɜ.

<SegTable kind="shiftNum"/>

## Digraphs

A capital after a letter changes it: `s` `⇧H` → ʃ. What each capital does: <ModifierMeanings/>.

<SegTable kind="digraphs"/>

## Extra letters

Letters from other alphabets. For accented letters, see [Languages](/languages).

<SegTable kind="extra"/>

## Typing plain letters

| Keys | Types |
| --- | --- |
| `⌃⇧` + letter | A plain capital: `⌃⇧G ⌃⇧H` is GH. |
| `⌃⌫` | Undoes the last change: θ back to tH. |
| Caps Lock | Capitals, never changed: TH stays TH. |
| Holding `⇧` | Capitals. Capital digraphs (`⇧A⇧E` → Æ) are an input-menu option, off by default. |
| `⌃Space` | Switches to your plain keyboard. |

## Diacritics (Option layer)

Press `⌥` and a key, then the letter: `⌥n` `n` → ñ. `⌥⇧` gives the key's second form. Length, stress and tone marks go after the letter instead.

<OptionBoard/>

<OptionShiftBoard/>

<MarkTable kind="ipa"/>

In the table, "replaces" means the second form swaps the mark instead of adding to it.

## Beyond IPA

Marks with no place on the IPA chart.

<BeyondTables/>

## Superscripts

`⌥z`, then the letter: `t` `⌥z` `h` → tʰ.

<SupTable/>

## Subscripts

`⌥⇧z`, then the letter: `x` `⌥⇧z` `2` → x₂.

<SubTable/>

## Cycles

Press the key again for the next mark in the family.

| Key | Family |
| --- | --- |
| `⌥n ⌥n`… | ◌̃ nasalized → ◌͊ denasal → ◌͋ nasal escape → ◌͌ velopharyngeal |
| `⌥w ⌥w`… | ◌̜ less rounded → ◌͍ labial spreading |
| `⌥⇧w ⌥⇧w`… | ◌̹ more rounded → ◌͎ whistled |

## Quotes

`⌥[` and `⌥⇧[` type the opening and closing quote, `⌥]` and `⌥⇧]` the inner pair, in the style chosen in the input menu. `⌥\` and `⌥⇧\` type ⟨ and ⟩.

| Style | Quotes | Inner quotes |
| --- | --- | --- |
| en | “ ” | ‘ ’ |
| de | „ “ | ‚ ‘ |
| fr | « » | ‹ › |
| ch | » « | › ‹ |
| pl | „ ” | « » |
| ru | « » | „ “ |
| sv | ” ” | ’ ’ |

## As data

[`/chart.json`](/chart.json) has the chart as data.
