---
title: "IPAbet — an IPA keyboard for macOS, at typing speed"
description: "IPAbet is a free, open-source IPA keyboard for macOS — type the International Phonetic Alphabet at full typing speed, in every app. A real input method, not a picker: your normal US keyboard with the IPA chart on its shifted layers, no codes to memorize, no copy-paste."
---

<p style="text-align:center;margin-top:-1rem"><a href="/learn">Try it yourself — learn to type it, right in the browser →</a></p>
<p style="text-align:center;margin-top:-.5rem;font-size:.92rem"><a href="/type">or just start typing in the scratchpad →</a></p>

## The vowel space

Every vowel is a base letter, at most one modifier on top: <Combo keys="i ⇧Y" out="ɨ"/>. Pick a modifier to see how the derived vowels are built, or drag between the articulatory quadrilateral and acoustic F1×F2 space. Click any vowel to hear it.

<div id="vowel-chart"></div>

## A normal keyboard, with the IPA one shift away

IPAbet is a **normal US keyboard**. Bare keys type plain US — letters, digits, punctuation, shortcuts, all untouched — so prose, code, and the terminal feel native; the IPA lives only on shifted positions. The IPA chart is layered onto the shifted positions: <Combo keys="s ⇧H" out="ʃ"/> <Combo keys="5 ⇧Y" out="ə"/> <Combo keys="⌥n n" out="ñ"/> — grounded in romanization conventions you already know, not codes to memorize. The [full IPA chart, annotated with its keystrokes](/chart), is one page away.

<Cards>
<Card title="Works in every app">
A real input method, not a website or palette: type IPA directly into Word, Praat, ELAN, LaTeX, Slack, your browser — at full speed, offline.
</Card>
<Card title="Nothing to memorize">
Digraphs follow pinyin/ITRANS-style romanization; diacritics sit on Apple's ABC&nbsp;Extended keys; the glyphs with no Latin letter live on the number-row bases — an unshifted digit plus a modifier (`5` `⇧Y` → ə).
</Card>
<Card title="Your keyboard stays yours">
Unshifted keys are 100% native US — Caps Lock included, so capitals stay capitals. Every key always emits something, and there is an escape for anything the IPA layer claims.
</Card>
</Cards>

## The layers

<LayersTable/>

## Typing IPA has a history

Generations of transcribers have gotten by on click-palettes, web pickers, hand-built keyboard layouts, and escape codes like X-SAMPA and TIPA — each an ingenious workaround for keyboards that stop at 26 letters, and each a system IPAbet learned something from. The bet here is simpler: transcription should just be _typing_.

## The full reference

Every symbol, every keystroke, every sound: [the IPA chart in IPAbet keystrokes](/chart) — one printable page, with audio. And [/learn](/learn) teaches it to your fingers in an afternoon.

## Install

IPAbet is in active development ahead of its first signed release. To build from source today:

1. Clone [github.com/bikeshaving/ipabet](https://github.com/bikeshaving/ipabet) and run <kbd>cd macos &amp;&amp; ./build.sh install</kbd>
2. **Log out and back in** — macOS requires this once for new input methods; it's normal.
3. System Settings → Keyboard → Input Sources → <kbd>+</kbd> → English → **IPA**.

<div class="note">A notarized installer package and Homebrew cask are coming with the first release — no Xcode, no logout surprises un-narrated.</div>

## FAQ

**Does it mess with normal typing?** The bare layer doesn't: letters, digits, punctuation, ⌘/⌃ shortcuts, tmux prefixes, and vim counts are all native US — and the shifted number symbols (<kbd>@</kbd> <kbd>#</kbd> <kbd>$</kbd> <kbd>%</kbd> <kbd>&</kbd>) type normally too. What the IPA layer claims is capital modifiers right after a letter (typing "GitHub" gives Giθub) and the digit _bases_ (an unshifted digit plus a modifier — <kbd>5</kbd> <kbd>⇧Y</kbd> → ə). <kbd>⌃⇧</kbd>+letter escapes a capital to itself (so "GitHub" typed with <kbd>⌃⇧H</kbd> stays GitHub), Caps Lock types literal capitals, and <kbd>⌥⇧Space</kbd> is the **Raw-US Lock**: one press makes the keyboard fully native (write code, paste in a terminal, type camelCase), one press brings the IPA back. Leave IPAbet on all day; lock and unlock as you switch registers.

**Are the symbols real IPA codepoints?** Yes — IPAbet emits the true characters (ə U+0259, ǃ U+01C3, ː U+02D0), never lookalikes. Your transcriptions are searchable, fontable Unicode.

**What does it cover?** The full standard IPA chart — every consonant, vowel, click, diacritic, and suprasegmental, including Chao tone letters (<kbd>⌥1</kbd>–<kbd>⌥5</kbd>) and both tie bars. Not yet: extIPA, the extensions for disordered speech.

**Privacy?** IPAbet is fully offline, makes no network connections, and is open source (MIT).
