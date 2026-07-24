---
title: "IPAbet — type the IPA at typing speed"
description: "IPAbet is a free, open-source IPA keyboard — type the International Phonetic Alphabet at full typing speed, in every app. A real input method, not a picker: your normal US keyboard with the IPA chart on its shifted layers, no codes to memorize, no copy-paste. Native on macOS, full engine in any browser."
---

<Callouts/>

## A normal keyboard, with the IPA one shift away

IPAbet is a **normal US keyboard**. Bare keys type plain US — letters, digits, punctuation, shortcuts, all untouched — so prose, code, and the terminal feel native; the IPA lives only on shifted positions. The IPA chart is layered onto the shifted positions: <Combo keys="s ⇧H" out="ʃ"/> <Combo keys="5 ⇧H" out="ə"/> <Combo keys="⌥n n" out="ñ"/> — grounded in romanization conventions you already know, not codes to memorize. The [full IPA chart, annotated with its keystrokes](/chart), is one page away.

<Cards>
<Card title="Works in every app">
A real input method, not a website or palette: type IPA directly into Word, Praat, ELAN, LaTeX, Slack, your browser — at full speed, offline.
</Card>
<Card title="Nothing to memorize">
Digraphs follow spellings you already know — sh, th, zh; diacritics sit where the Mac's own accent keys put them; and the glyphs with no Latin letter live on the number row (`5` `⇧H` → ə).
</Card>
<Card title="Your keyboard stays yours">
Unshifted keys are 100% native US — Caps Lock included, so capitals stay capitals. Every key always emits something, and there is an escape for anything the IPA layer claims.
</Card>
</Cards>

## The layers

<LayersTable/>

## The full reference

Every symbol, every keystroke, every sound: [the IPA chart in IPAbet keystrokes](/chart) — one printable page, with audio. And [/learn](/learn) teaches it to your fingers in an afternoon.

## Install

1. [Download **IPAbet.pkg**](/download) and run the installer.
2. **Log out and back in** — macOS registers new input methods at login.
3. Pick **IPA** in the input menu, or add it under System Settings → Keyboard → Input Sources → <kbd>+</kbd> → English → **IPA**.

Prefer to build from source? One command — <kbd>cd macos && ./build.sh install</kbd> — from [the repo](https://github.com/bikeshaving/ipabet).

## The fine print

**Does it mess with normal typing?** The bare layer doesn't: letters, digits, punctuation, ⌘/⌃ shortcuts, tmux prefixes, and vim counts are all native US — and the shifted number symbols (<kbd>@</kbd> <kbd>#</kbd> <kbd>$</kbd> <kbd>&</kbd>) type normally too. What the IPA layer claims is capital modifiers right after a letter (typing "GitHub" gives Giθub), the digit _bases_ (an unshifted digit plus a modifier — <kbd>5</kbd> <kbd>⇧H</kbd> → ə), and <kbd>⇧5</kbd> right after a bare e, o, or a (the centralize modifier — everywhere else <kbd>%</kbd> stays %). <kbd>⌃⇧</kbd>+letter escapes a capital to itself (so "GitHub" typed with <kbd>⌃⇧H</kbd> stays GitHub) and Caps Lock types literal capitals. For long stretches of native typing — code, terminals, camelCase — switch input sources: <kbd>⌃Space</kbd> flips to the plain US layout macOS always keeps installed, and the menu-bar icon shows which keyboard is live. IPAbet ships no raw mode of its own; the OS already has one.

**Are the symbols real IPA codepoints?** Yes — IPAbet emits the true characters (ə U+0259, ǃ U+01C3, ː U+02D0), never lookalikes. Your transcriptions are searchable, fontable Unicode.

**What does it cover?** The full standard IPA chart — every consonant, vowel, click, diacritic, and suprasegmental, including Chao tone letters (<kbd>⌥1</kbd>–<kbd>⌥5</kbd>) and both tie bars. Plus every diacritic of the 2015 extIPA set, the extensions for disordered speech; its symbol letters (ʬ ʭ ʪ ʫ ʩ ꞎ ʞ) are not assigned.

**Privacy?** An input method sees every keystroke, so IPAbet doesn't ask for trust — it's **App-Sandboxed with zero network entitlements**: macOS itself denies it any network access. Fully offline by OS enforcement, and open source (MIT), so you can check both claims.
