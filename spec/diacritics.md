# IPAbet diacritic input — design

Status: **Active Specification**

## Principle

IPAbet is a **normal US keyboard** with IPA layered onto its shifted positions.
Type unshifted and you get exactly US — every letter, digit, and punctuation
mark is native and untouched, so the layout is a flawless daily driver: prose,
shell, tmux prefixes, vim counts, and app shortcuts all behave as if no IME
were running. The IPA is purely **additive**, one modifier away:

- IPA base letters that *are* Latin letters (a, s, t, m…) → just the bare key.
- IPA base glyphs with *no* Latin key (ə, ʔ, ɾ, ɨ…) → **Shift + number**.
- IPA modifications (digraph transforms like `tH`→θ) → **Shift + letter** after
  a glyph.
- diacritics → **Option** (Apple's ABC Extended layout — familiar to any Mac
  user who has typed `é` or `ā`).
- the raw US character an IPA layer would otherwise claim → **Option-Shift**.

Nothing US is ever lost; you never fight the keyboard to type a quote, comma,
digit, or bracket.

**Every keystroke emits something — no silent no-ops, ever.** A key that finds
no applicable IPA interpretation falls through until something is produced: the
IPA glyph, the decorated mark, or the raw key. This is a hard invariant, not a
nicety — a dead keystroke is always a bug.

## Four layers, one meaning each

| Layer | Behavior |
|---|---|
| **bare** | plain US — letters, digits, punctuation, native and untouched |
| **Shift** | US shift (capitals, symbols), overridden where IPA needs it: **number keys → IPA base glyphs**; a letter right after a glyph → IPA modifier (`tH`→θ) |
| **Option** | IPA diacritics, postfix — ABC Extended + IPA-only pictograms |
| **Option-Shift** | the raw US shifted character — the escape for anything an IPA layer claims |

**Option-Shift is the "Raw US" escape hatch:** `⌥⇧H`→`H`, `⌥⇧2`→`@`, `⌥⇧4`→`$`
— the raw shifted character of any key, for a symbol an IPA layer claims. Plain
digits need no escape: they're the bare number keys.

**Typography principle:** *Preserve prose typography (quotes, dashes, ellipsis)
for academic writing; sacrifice obscure math/ligature glyphs (≠, ß, æ) to
accommodate the IPA layer.* So `⌥'`→ˈ (was æ), `⌥=`→advanced (was ≠), `⌥s`→
syllabic (was ß) are fair game, while the marks people actually use in prose
are kept or rescued.

**Option-Shift for punctuation keys preserves standard Mac typography:** Keys like `[` and `]` retain their standard Mac shortcuts for smart quotes (`⌥[` → `“`, `⌥⇧[` → `”`). The dash set (`⌥-` en-dash, `⌥⇧-` em-dash) is entirely untouched.
*   *Rescued Typography:* Because long `ː` overwrites `⌥;`, its default Mac typographic mark is moved to Option-Shift: **`⌥⇧;` → `…` (ellipsis)**.

### Number row

Bare number keys are **native US digits** — the IME declines them entirely, so
they pass through as real digit keys (tmux prefixes, vim counts, app shortcuts,
not just text). **Shift + number** yields the IPA glyph with no Latin home:

`⇧1`→ɨ, `⇧2`→ʔ, `⇧3`→ʕ, `⇧4`→ɾ, `⇧5`→ə, `⇧6`→ɐ, `⇧7`→ħ, `⇧8`→/ (solidus).

Where a number key has no IPA glyph (`9`, `0`), Shift falls through to the
native US symbol — so `(` and `)` stay one keystroke away on `⇧9`/`⇧0`. The
other shifted symbols (`! @ # $ % ^ & *`) live on `⌥⇧`.

*(This supersedes the earlier "Caps Lock number mode" idea, now removed: with
bare = native digit, digits are always available and no mode is needed.)*

## The doubling rule (morphology)

**Pressing a mark key a second time yields the mark's other form** (postfix: it
re-reads the just-decorated glyph and upgrades in place). This works without
collision because marks with a doubled form have no positional twin and vice versa.

- above ↔ below (e.g., tilde above = nasalized, tilde below = creaky)
- single ↔ double (e.g., acute = high tone, double acute = extra-high)
- primary ↔ secondary (e.g., primary stress ↔ secondary stress)
- specific transliteration rescues (e.g., mid-centralized ↔ dot below)

Repeat presses **cycle** through a mark's forms and wrap around (`⌥e`×3 is
acute again). A mark with only one form **caps**: pressing it on a base that
already wears it emits the mark's *standalone form* — its spacing clone
(`ā`+`⌥a` → `ā¯`, `ê`+`⌥6` → `ê^`), or the combining mark carried on a
no-break space for IPA-only marks with no clone. The cluster itself never
accumulates duplicates. (A bare combining mark cannot be "inserted after" a
cluster — Unicode attaches it right back; that *is* stacking. Hence the
clone.) Mark keys never *remove*: backspace is the peeler, and a keystroke
always moves the text forward, never silently no-ops.

## Tier 1 — ABC Extended key assignments (postfix)

"Verbatim" means the **key→mark assignment** is ABC Extended's (⌥e = acute,
⌥v = caron…), dumped from macOS — so a Mac user knows *which* key carries
*which* accent. The **input order is postfix like everything else**: type the
base, then `⌥`+key decorates it (`e` then `⌥e` → é), not ABC's native prefix.
This is the one uniform rule; ABC's prefix order is not preserved.

| ⌥ key | mark | IPA use | ×2 → |
|---|---|---|---|
| `e` | ́ acute | high tone | ̋ double acute (extra-high) |
| `` ` `` | ̀ grave | low tone | ̏ double grave (extra-low) |
| `6` | ̂ circumflex | falling tone | — |
| `v` | ̌ caron | rising tone | ̬ caron below (voiced) |
| `a` | ̄ macron | mid tone | — |
| `n` | ̃ tilde | nasalized | ̰ tilde below (creaky) |
| `u` | ̈ diaeresis | centralized | ̤ diaeresis below (breathy) |
| `b` | ̆ breve | extra-short | ̯ inverted breve below (non-syllabic) |
| `k` | ̥/̊ ring | voiceless (engine positions above/below by base) | — |

**Preserved Transliteration Keys:** three of ABC's other dead keys keep their
assignment (for transliteration and Americanist linguistics), postfix: **`w`**
(dot above `̇`, e.g. `n`→ṅ), **`c`** (cedilla `̧`, `c`→ç), **`m`** (ogonek `̨`,
`a`→ą). *Not* preserved — three ABC dead keys are repurposed because their marks
are obscure: **`h`** (low line → retracted, Tier 2), **`x`** (dot below →
mid-centralized, with dot-below rescued on `⌥x`×2), **`l`** (stroke →
velarized). So "verbatim" is precise about the nine IPA tone/diacritic keys and
`w`/`c`/`m`; `h`/`x`/`l` are deliberate overrides.

## Tier 2 — IPA-only marks & Suprasegmentals

These have no ABC Extended home (or explicitly adapt an ABC Extended analogue). Keys are mapped based on the mnemonic **X-SAMPA** (linguists' 30-year ASCII convention, name-letters) and **TIPA** (LaTeX IPA, shape-iconic chars).

| ⌥ key | mark | IPA use | grounding | ×2 → |
|---|---|---|---|---|
| `'` | ˈ vert line | primary stress | Standard quote key | ˌ secondary stress |
| `;` | ː long | full length | Standard colon key | ˑ half-long |
| `d` | ̪ bridge below | dental | X-SAMPA `_d` (keeps `[` free) | ̺→̻→̼ apical / laminal / linguolabial |
| `=` | ̟ plus below | advanced | `+` universal (X-SAMPA/TIPA) | ̘ left tack (ATR); X-SAMPA `_A` |
| `h` | ̠ minus below | retracted | ABC Ext "low line" analogue | ̙ right tack (RTR) |
| `.` | ̝ up tack | raised | period rides high on the line | — |
| `,` | ̞ down tack | lowered | comma rides low | — |
| `9` | ̜ left half-ring | less rounded | TIPA `(` draws left half-ring | — |
| `0` | ̹ right half-ring | more rounded | TIPA `)` draws right half-ring | — |
| `s` | ̩ vert line below | syllabic | TIPA `\s` = **S**yllabic | ̍ line above (syllabic variant) |
| `t` | ͡ tie bar | affricate tie | TIPA `\t` = **T**ie | ‿ undertie (linking) |
| `x` | ̽ x above | mid-centralized | `x` = × shape | ̣ dot below (Rescues native ABC Ext) |
| `l` | ̴ tilde overlay | velarized/pharyng. | ABC Ext "stroke/slash" analogue | — |
| `r` | ↗ | global rise | X-SAMPA `<R>` = **R**ise | — |
| `f` | ↘ | global fall | X-SAMPA `<F>` = **F**all | — |
| `q` | ̚ left angle above | unreleased | Mnemonic: **Q**uiet / **Q**uash | — |
| `1` `2` | ꜜ ꜛ | downstep/upstep | X-SAMPA `!` / `^` (Africanist) | — |

Absorbed by the doubling rule from Tier 1 and 2, requiring no base key of their own: voiced (`⌥v`×2), creaky (`⌥n`×2), breathy (`⌥u`×2), non-syllabic (`⌥b`×2), extra-high/low tone (`⌥e`×2 / `⌥``×2), ATR/RTR (`⌥=`×2 / `⌥h`×2), apical/laminal/linguolabial (`⌥d` cycle), secondary stress (`⌥'`×2), half-length (`⌥;`×2), and transliteration dot-below (`⌥x`×2).

## Handled outside the mark layer

- **ʰ and all superscripts** via the superscript operator on **`⌥4`** (`h`
  then `⌥4` → ʰ) — a postfix transform of the previous glyph, like any Option
  mark. Moved off `$` (Shift-4), which is now a **literal dollar sign** always;
  `⌥4` keeps the operator on the same physical key it used to occupy.
- **rhotic hook** ˞ via vowel + `R` (unchanged).
- **syllable break** `.` is a literal period on the bare layer.

## Engine Architecture

- **Stateless (no dead-key state):** because marks are postfix, nothing is
  ever "held." Each `⌥`+mark reads the previous grapheme and rewrites it
  decorated — no pending-mark buffer, no state to desync on clicks/focus
  changes. The "other form" (doubling) logic also reads the document: if the
  previous grapheme's trailing mark already *is* this key's mark, upgrade it in
  place; otherwise stack. This is strictly simpler than a prefix dead-key state
  machine — the same stateless model the current engine already uses.
- **Postfix marks:** type the base, then `⌥`+mark decorates the previous
  grapheme (linguist / X-SAMPA / SIL convention). Multiple marks stack by
  repeated application; the doubling rule is unambiguous (same mark again =
  upgrade, different mark = stack). Uses the proven `lastCluster`/`replace`
  path — the same mechanism as the letter transforms — which the probe
  confirmed is cursor-safe in AppKit and WebKit. Spacing marks (ˈ ˌ ː …)
  immediate-insert; their doubling reads back and replaces.

  *Why postfix, not the Mac-standard prefix:* prefix dead keys are a typewriter
  artifact — the accent key was the non-advancing ("dead") strike so the next
  letter overstruck it. Static keyboard layouts inherited this because a layout
  is forward-only and cannot edit already-emitted text; postfix is impossible
  there. An IME is not a static layout — it can reach back (as ours does), so
  ordering is a free choice, and postfix matches linguist convention *and*
  Unicode's own base-then-combining string order. See research memo in commit
  history.

  *Reach-back tradeoffs to test (not ordering — these are where a replacement
  IME actually gets bitten):* undo atomicity (emit each replacement as one
  edit; test ⌘Z in TextEdit/Pages/browsers/Electron); autocorrect/predictive
  races (Safari & Chrome address bars); VoiceOver re-announcement when a base
  is swapped for its decorated form; grapheme-cluster-safe reach-back (operate
  on cluster boundaries, never code units, since the previous glyph may already
  be multi-codepoint); and graceful fallback where `replacementRange` is
  refused (secure/password fields, terminals) — insert forward or no-op, never
  silently drop.
- **Positioning:** the voiceless ring (`⌥k`) is placed by the base character —
  above on descender bases (ŋ̊, ɡ̊, j̊), below otherwise (n̥, l̥).
- **No base to decorate:** when `⌥`+mark is pressed with nothing before the
  cursor, emit the mark's **spacing form** where one exists (`⌥e`→`´`,
  `⌥n`→`˜`, `⌥;`→`ː`); for IPA-only marks with no spacing clone
  (bridge-below, tacks, half-rings), emit the combining mark carried on a
  no-break space. Never a silent no-op. The spacing clones live in
  `ipabet.json` (`clone` field) and also serve the cap rule above.
