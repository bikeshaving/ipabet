---
title: "IPAbet — type the IPA at typing speed"
description: "IPAbet is a free, open-source IPA keyboard — type the International Phonetic Alphabet at full typing speed, in every app. A real input method, not a picker: your normal US keyboard with the IPA chart on its shifted layers, no codes to memorize, no copy-paste. Native on macOS, full engine in any browser."
---

<Callouts/>

## A normal keyboard, with the IPA one shift away

IPAbet is a **normal US keyboard**. Bare keys type plain US — letters, digits, punctuation, shortcuts, all untouched — so you can leave it switched on all day — notes, email, and prose feel native (and yes, code and the terminal too). The IPA lives only on the shifted positions: <Combo keys="s ⇧H" out="ʃ"/> <Combo keys="5 ⇧H" out="ə"/> <Combo keys="⌥n n" out="ñ"/> — grounded in romanization conventions you already know, not codes to memorize. The [full IPA chart, annotated with its keystrokes](/chart), is one page away.

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

An input method sees every keystroke, so IPAbet doesn't ask for trust: it is **App-Sandboxed with zero network entitlements** — macOS itself denies it the network — fully offline by OS enforcement, and MIT-licensed so you can check both claims. Bug reports and feature requests live on [GitHub issues](https://github.com/bikeshaving/ipabet/issues).
