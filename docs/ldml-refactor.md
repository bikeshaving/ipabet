# One engine, keyboards as data

The goal: IPAbet becomes a *keyboard description* read by a *generic engine*,
with nothing keyboard-specific baked into the engine and nothing that isn't a
keyboard baked into the description. The end state is the factory — one engine,
N keyboard files — and the standards-aligned version of it is LDML (UTS #35 §7)
as the description format.

This is the plan and the audit it rests on. Written because it spans the engine,
the spec, and every shell, and will take several steps.

## Three homes for every piece of behavior

Everything the code does today belongs in exactly one of these. The bar for the
engine is high: **default everything to data; promote to the engine only what is
provably true of every keyboard.** The two failure modes are symmetric — bake a
keyboard's behavior into the engine and keyboard #2 can't express what it needs
(Keyman's rule-soup, with our name on it); push a universal mechanism into the
data and every keyboard re-specifies it and they drift.

### 1. Universal mechanism — stays in the engine

True of any keyboard. In `engine/src/lib.rs` today this is, correctly:

- `fuse_marks` / `recompose` — NFC composition, shortest spelling for same-class marks
- `last_cluster` — UAX #29 grapheme segmentation
- `decompose` — NFD split into base + combining marks
- `apply_edit` — replace N codepoints / insert / pass / noop
- `is_letter` — general-category L test
- the pending/dead-key state machine and the edit/step model

Under LDML most of this maps to normalization + `reorder`; it is the small,
generic residue that survives the audit.

### 2. Keyboard data — must move OUT of the engine into the description

Specific to IPAbet, currently **hard-coded in the engine (and triplicated across
the Rust, JS, and Swift ports)**. Every one of these is the wrong home:

| In the engine today | Lines (lib.rs) | Becomes |
| --- | --- | --- |
| `CONTOURS` (mark seq → contour letter) | 927 | data / mostly reorder+NFC |
| `stroked` table (~30 letters) | 946 | data (transform outputs) |
| `tilded` table (~12 letters) | 958 | data (transform outputs) |
| `shifted_digit` / `shifted_punct` (US shift plane) | 966, 974 | data (a layer) |
| tie scalars `U+0361/035C/0362`, over/undertie | 518, 636 | data |
| raise/lower operator glyphs `⁻ ₋` | 170 | data |
| `HAND_CAPS` ʔ→Ɂ | 585 | data |
| interpunct `·`, specific mark scalars in branches | 479, 697 | data |
| quote fallback quad | 292 | data / setting |

Some already live in `spec/ipabet.json` (letters, marks, transforms); the split
between "in the JSON" and "in the engine" is arbitrary and is the first thing to
fix.

### 3. Grammar that looks like engine logic but is data

The surprise, and the reason LDML fits: IPAbet's *grammar* — "a shift-letter
modifies the previous glyph," "a digit is a base," "Option is a prefix dead-key
layer" — is hard-coded as control flow in `handle_key_core`, but under a
transform model it is **data**: a class of transform rules, not code. Most of
what feels like the engine is the keyboard, expressed as procedure.

## The one thing that fits none of these: shift-chain break

IPAbet keys the shift-chain off whether shift was *physically released between
keystrokes* (`shiftBroke`). That is not universal mechanism, and it is not
expressible as a buffer transform (LDML sees modifier state at each key, not the
transition history). It resolves in a **fourth home — the shell**: the shell
already computes `shiftBroke` from OS events, so it emits a *distinct key
identity* for "shifted letter after a broken shift," and the description matches
that with ordinary transforms. The nonstandard bit is confined to the shell's
event→key mapping, which is already per-platform. If the audit turns up more
residents of this home, that set is the true shape of what a keyboard engine
can't be data alone.

## Sequence

Ordered so no step refactors code a later step deletes.

1. **Adopt the Rust core on macOS.** Kills the Swift engine duplicate — link the
   crate through the same `ipabet_engine.h` the C shells use, reduce
   `InputController.swift` to a thin IMKit shell. The parity + fuzz + macOS
   harness verify the swap is behavior-preserving. Down to one engine + the JS
   mirror. **(Spike done — see below.)**
2. **Compile the Rust core to wasm; replace the JS engine.** Kills the JS
   duplicate. Website `/type` and the parity suite run the same wasm. Note: this
   collapses the differential-fuzz oracle (both sides become one Rust engine) —
   accept that, since divergence becomes impossible.
3. **Extract the category-2 tables from the engine into the description.** Now a
   one-place change, not three. Behavior-preserving: the parity/fuzz vectors
   must still pass unchanged.
4. **Convert the bespoke description to LDML**, with a content/pedagogy layer
   split out (the chart/course/docs generate from keyboard-file + content-file,
   never from one conflated file).
5. **Generalize the engine to LDML semantics** (transforms/reorder/markers/
   layers), or adopt/port an existing LDML engine (Keyman's is open source).
6. **Move the shift-chain-break signal to the shell** as an emitted key identity.

The forcing function throughout is IPAbet itself: the weirdest keyboard we have.
If it round-trips through pure LDML with only shell-level help, the factory
architecture is validated on the hardest existing example. Where it won't, we've
found the real boundary cheaply — before building the general engine.

## Out of scope until it isn't

CJK candidate-selection input (Searle) is outside LDML entirely and outside this
engine's edit model. It is a separate problem and must not distort the boundary
decisions above.
