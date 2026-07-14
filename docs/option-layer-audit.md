# What the Option layer costs

The macOS US Option layer is not empty space — it is where macOS keeps its
typography. IPAbet's diacritic layer is stacked directly on top of it. This
records what that costs, measured against the *real* layout (dumped from the
system with `macos/tools/dump-us-layer.swift`, not from memory).

## The tally

| Plane | keys | IPAbet claims | native character destroyed | reachable another way | macOS keeps |
| --- | --- | --- | --- | --- | --- |
| `⌥` | 47 | 37 | **27** | 10 | 10 |
| `⌥⇧` | 47 | 25 | **12** | 13 | 22 |

## Gone for good

No other keystroke produces these. They are not IPA, so no digraph brings them
back, and the layer they lived on is now the diacritic layer.

- **Currency — € £ ¥ ¢.** A British academic cannot type £; a European one
  cannot type €. The worst finding.
- **Punctuation — …** (`⌥;` is now ː, length, and non-negotiable).
- **Letters — å Å.** Ring-above has no key at all: `⌥k` is the ring *below*, so
  you get ḁ. Phonetics runs on Scandinavian names and journals.
- **Marks — © ™ µ π.** (® and ° survive by luck of the draw, not by design.)
- **Mathematics — ≈ ≠ ≤ ≥ ± ∞ ∑ √ ∫ ∂ ∆ Ω ¬.** Fine in LaTeX, where they are
  commands. Not fine in Word or email.

## What was defended, and what came back

The dead keys are clean: IPAbet takes `⌥e ⌥i ⌥u ⌥n ⌥\`` but maps them to the
**same marks macOS does**, so é è ê ë ñ ü ö ä ç and their capitals compose
exactly as before. æ œ ø come back as IPA digraphs (`a ⇧E`, `o ⇧E`, `e ⇧W`), ß
was re-homed on `⌥⇧6`, ¡ on `⌥⇧1`. The orthographic punctuation — – — “ ” ‘ ’
« » ÷ ¿ — was reserved on purpose (`laws.punctuation`) and survives.

## The conclusion

**The keyboard is full.** Restoring £ costs a tone bar; restoring … costs vowel
length. There is no assignment clever enough to escape this, because the slots
were spoken for before IPAbet arrived.

This is the same wound as `SHIFT` → `ƩIFT`, just quieter: an always-on layer
taxes normal typing forever. A **mode** — the whole IPA layer behind a lock —
charges the tax only when the user has asked for it, and hands back all 39
characters by default. That is the strongest argument on the table for it.
