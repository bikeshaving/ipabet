// The IPAbet keystroke engine, hand-ported from js/src/index.ts (itself
// ported from macos/Sources/InputController.swift). Section comments mirror
// the reference file so the two can be read side by side. Verified
// byte-for-byte against every case in spec/parity-vectors.json (see
// tests/parity.rs) — the same fixture the eventual Windows port replays
// against too, since this crate is meant to be reused there directly.
//
// spec/ipabet.json parses generically via serde (`spec.rs`) — no hand-written
// parser. Composition uses unicode-normalization's nfc(), which correctly
// reorders combining marks by class before composing (verified directly
// against the tone-vs-shape-mark case this matters for). Internal
// representation is `char`/`String` throughout (Rust's `char` already IS a
// Unicode scalar value), with `Edit::Replace.length` a codepoint count —
// nothing here is ever UTF-16.

mod spec;
pub mod ffi;

use spec::Spec;
use std::collections::HashMap;
use unicode_normalization::UnicodeNormalization;

// ------------------------------------------------------------------ types

#[derive(Clone, Debug, Default)]
pub struct Keystroke {
    /// The key's unshifted US-layout label: "a", "5", ";", "Escape", "⌫" …
    pub key: String,
    pub shift: bool,
    pub option: bool,
    /// Shift was physically RELEASED since the previous keystroke.
    pub shift_broke: bool,
    /// A lock, not a modifier.
    pub caps_lock: bool,
    /// Only ⌃⇧<letter> is claimed.
    pub control: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Edit {
    Insert { text: String },
    /// Replace the last `length` CODEPOINTS before the cursor with `text` —
    /// see the module doc for why this isn't UTF-16 units here.
    Replace { length: usize, text: String },
    /// Defer to the host: native character, native delete, native shortcut.
    Pass,
    /// Only the pending composition changed; the document is untouched.
    Noop,
}

/// A diacritic awaiting a base, held by the HOST — never a sentinel
/// character in the document. `Raise`/`Lower` are operators, not marks:
/// unconsumed, they commit nothing and lift.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PendingItem {
    Mark(char),
    Raise,
    Lower,
}

pub type Pending = Vec<PendingItem>;

/// An edit, the next pending, and whether a shift release broke an IPA
/// chain. Only the caller can see a release, so it threads `chain_broken`
/// back in (`None` when the JS engine's Step.chainBroken would be absent).
pub struct Step {
    pub edit: Edit,
    pub pending: Pending,
    pub chain_broken: Option<bool>,
}

struct Mark {
    mark: char,
    spacing: bool,
    double: Option<char>,
    double_spacing: bool,
    cycle: Vec<char>,
    double_cycle: Vec<char>,
}

// ---------------------------------------------------------------- engine

pub struct Engine {
    letters: HashMap<String, String>, // key label ("s", "5H") or glyph -> glyph
    transforms: HashMap<String, String>, // (prev glyph or digit) + modifier char -> glyph
    unconvert_key: HashMap<String, String>, // glyph -> key label
    opt_shift_digits: HashMap<char, String>,
    opt_marks: HashMap<char, Mark>,
    sups: HashMap<char, char>,
    subs: HashMap<char, char>,
    unsup: HashMap<char, char>,
    unsub: HashMap<char, char>,
    exclusive_twin: HashMap<char, char>,
    clone_of: HashMap<PendingItem, char>,
    quote_locales: HashMap<String, [char; 4]>,
    quote_default: String,
    quote_active: String,
    capital_digraphs: bool,
}

fn first_char(s: &str) -> char {
    s.chars().next().unwrap_or('\0')
}

impl Engine {
    pub fn new(spec_json: &str) -> Result<Engine, serde_json::Error> {
        let spec: Spec = serde_json::from_str(spec_json)?;

        let mut letters = HashMap::new();
        for e in &spec.letters {
            letters.insert(e.key.clone(), e.glyph.clone());
        }

        let mut opt_marks = HashMap::new();
        let mut exclusive_twin = HashMap::new();
        let mut clone_of = HashMap::new();
        for e in &spec.marks {
            let opt = first_char(&e.opt);
            let mark = first_char(&e.mark);
            let double = e.double.as_deref().map(first_char);
            opt_marks.insert(
                opt,
                Mark {
                    mark,
                    spacing: e.kind == "spacing",
                    double,
                    double_spacing: e.double_spacing,
                    cycle: e.cycle.iter().map(|s| first_char(s)).collect(),
                    double_cycle: e.double_cycle.iter().map(|s| first_char(s)).collect(),
                },
            );
            if let Some(c) = &e.clone {
                clone_of.insert(PendingItem::Mark(mark), first_char(c));
            }
            if let (Some(dbl), Some(dc)) = (double, &e.double_clone) {
                clone_of.insert(PendingItem::Mark(dbl), first_char(dc));
            }
            if e.exclusive
                && let Some(dbl) = double {
                    exclusive_twin.insert(mark, dbl);
                    exclusive_twin.insert(dbl, mark);
                }
        }
        // RAISE/LOWER previews — operators, not real marks, but clone_of is
        // just PendingItem -> char, so they slot in like anything else.
        clone_of.insert(PendingItem::Raise, '\u{207B}'); // ⁻
        clone_of.insert(PendingItem::Lower, '\u{208B}'); // ₋

        let mut sups = HashMap::new();
        let mut unsup = HashMap::new();
        for e in &spec.superscripts.table {
            if let Some(sup) = &e.sup {
                let (b, s) = (first_char(&e.base), first_char(sup));
                sups.insert(b, s);
                unsup.entry(s).or_insert(b);
            }
        }
        let mut subs = HashMap::new();
        let mut unsub = HashMap::new();
        for e in &spec.subscripts.table {
            if let Some(sub) = &e.sub {
                let (b, s) = (first_char(&e.base), first_char(sub));
                subs.insert(b, s);
                unsub.entry(s).or_insert(b);
            }
        }

        // transforms + unconvert_key: mirrors index.ts's single loop over `letters`.
        let mut transforms = HashMap::new();
        let mut unconvert_key = HashMap::new();
        for e in &spec.letters {
            let key = &e.key;
            let glyph = &e.glyph;
            if key.chars().count() != 2 {
                continue;
            }
            let mut chars = key.chars();
            let k0 = chars.next().unwrap();
            let k1 = chars.next().unwrap();
            let prev = if k0.is_ascii_digit() {
                Some(k0.to_string())
            } else {
                letters.get(&k0.to_string()).cloned()
            };
            if let Some(prev) = prev {
                transforms.insert(format!("{prev}{k1}"), glyph.clone());
            }
            let existing_alias = letters.get(glyph);
            let is_identity_alias = existing_alias.is_some_and(|a| a == glyph);
            if !unconvert_key.contains_key(glyph) && !is_identity_alias {
                unconvert_key.insert(glyph.clone(), key.clone());
            }
        }

        let mut opt_shift_digits = HashMap::new();
        for (k, v) in &spec.opt_shift {
            if k.chars().count() == 1 {
                let c = first_char(k);
                if c.is_ascii_digit() {
                    opt_shift_digits.insert(c, v.clone());
                }
            }
        }

        let mut quote_locales = HashMap::new();
        for (loc, arr) in &spec.quotes.locales {
            if arr.len() == 4 {
                let quad = [
                    first_char(&arr[0]),
                    first_char(&arr[1]),
                    first_char(&arr[2]),
                    first_char(&arr[3]),
                ];
                quote_locales.insert(loc.clone(), quad);
            }
        }
        let quote_default = spec.quotes.default.clone();

        Ok(Engine {
            letters,
            transforms,
            unconvert_key,
            opt_shift_digits,
            opt_marks,
            sups,
            subs,
            unsup,
            unsub,
            exclusive_twin,
            clone_of,
            quote_locales,
            quote_active: quote_default.clone(),
            quote_default,
            capital_digraphs: false,
        })
    }

    pub fn set_capital_digraphs(&mut self, on: bool) {
        self.capital_digraphs = on;
    }

    pub fn set_quote_locale(&mut self, locale: &str) {
        self.quote_active = if self.quote_locales.contains_key(locale) {
            locale.to_string()
        } else {
            self.quote_default.clone()
        };
    }

    fn quote_quad(&self) -> [char; 4] {
        self.quote_locales[&self.quote_active]
    }

    // ------------------------------------------------------------ unicode

    /// The last "cluster" of `text` (a base codepoint plus any trailing
    /// combining marks), as a suffix. `None` if `text` is empty.
    fn last_cluster(text: &str) -> Option<&str> {
        if text.is_empty() {
            return None;
        }
        let mut boundary = text.len();
        for (i, c) in text.char_indices().rev() {
            if unicode_normalization::char::is_combining_mark(c) {
                boundary = i;
                continue;
            }
            boundary = i;
            break;
        }
        Some(&text[boundary..])
    }

    /// Split a cluster into its base glyph and trailing combining marks
    /// (NFD), mirroring decompose() in index.ts exactly, including its
    /// "once any mark appears, everything after goes to marks" rule.
    fn decompose(cluster: &str) -> (String, Vec<char>) {
        let mut base = String::new();
        let mut marks = Vec::new();
        for c in cluster.nfd() {
            if marks.is_empty() && !unicode_normalization::char::is_combining_mark(c) {
                base.push(c);
            } else {
                marks.push(c);
            }
        }
        (base, marks)
    }

    /// Recomposes base+marks to its shortest NFC spelling, trying every mark
    /// permutation when there's more than one — mirrors recompose()
    /// exactly: two marks of the SAME combining class never reorder under
    /// NFC (nfc() only reorders marks of different classes automatically),
    /// so which one is typed first can determine whether they fuse into one
    /// precomposed glyph.
    fn recompose(base: &str, marks: &[char]) -> String {
        if marks.len() <= 1 {
            let s: String = base.chars().chain(marks.iter().copied()).collect();
            return s.chars().nfc().collect();
        }
        let mut best: Option<String> = None;
        for perm in permutations(marks) {
            let s: String = base.chars().chain(perm).collect();
            let composed: String = s.chars().nfc().collect();
            if best.as_ref().is_none_or(|b| composed.chars().count() < b.chars().count()) {
                best = Some(composed);
            }
        }
        best.unwrap_or_default()
    }

    // ------------------------------------------------------------- marks

    /// The dead-key preview / commit string: each pending mark as its
    /// spacing clone (falling back to itself if there's no clone).
    /// `skip_operators`: a COMMIT drops Raise/Lower entirely (an unconsumed
    /// operator lifts without residue); a PREVIEW shows their small-mark glyph.
    fn render_pending(&self, pending: &[PendingItem], skip_operators: bool) -> String {
        pending
            .iter()
            .filter(|item| !(skip_operators && matches!(item, PendingItem::Raise | PendingItem::Lower)))
            .map(|item| self.clone_of.get(item).copied().unwrap_or_else(|| match item {
                PendingItem::Mark(c) => *c,
                _ => unreachable!("Raise/Lower always have a clone_of entry"),
            }))
            .collect()
    }

    pub fn preview_string(&self, pending: &Pending) -> String {
        self.render_pending(pending, false)
    }

    /// What an unconsumed pending composition writes when it commits (Esc,
    /// space, or the end of a keystroke sequence).
    pub fn commit_string(&self, pending: &Pending) -> String {
        self.render_pending(pending, true)
    }

    fn flush(&self, pending: &Pending) -> Step {
        if pending.is_empty() {
            return Step { edit: Edit::Noop, pending: vec![], chain_broken: None };
        }
        let text = self.commit_string(pending);
        if text.is_empty() {
            return Step { edit: Edit::Noop, pending: vec![], chain_broken: None };
        }
        Step { edit: Edit::Insert { text }, pending: vec![], chain_broken: None }
    }

    /// The contour this mark completes, consuming the levels before it.
    fn contour_of(pending: &[PendingItem], scalar: char) -> Option<Step> {
        for len in [3usize, 2] {
            if pending.len() + 1 < len {
                continue;
            }
            let keep = pending.len() - (len - 1);
            let mut seq: Vec<char> = pending[keep..]
                .iter()
                .map(|item| match item {
                    PendingItem::Mark(c) => *c,
                    _ => '\0',
                })
                .collect();
            seq.push(scalar);
            if let Some(atom) = contour_atom(&seq) {
                let mut next: Pending = pending[..keep].to_vec();
                next.push(PendingItem::Mark(atom));
                return Some(Step { edit: Edit::Noop, pending: next, chain_broken: None });
            }
        }
        None
    }

    /// Stack a diacritic into the pending composition. The same form again
    /// peels it off, unless the key declares a CYCLE, which advances and wraps.
    fn pending_diacritic(&self, scalar: char, pending: &Pending, cycle: &[char]) -> Step {
        if let Some(contour) = Self::contour_of(pending, scalar) {
            return contour;
        }
        let top = pending.last().copied();
        let family: Vec<char> = std::iter::once(scalar).chain(cycle.iter().copied()).collect();
        let at = match top {
            Some(PendingItem::Mark(c)) => family.iter().position(|&f| f == c),
            _ => None,
        };
        let next: Pending = if let (Some(at), false) = (at, cycle.is_empty()) {
            let mut n = pending[..pending.len() - 1].to_vec();
            n.push(PendingItem::Mark(family[(at + 1) % family.len()]));
            n
        } else if top == Some(PendingItem::Mark(scalar)) {
            pending[..pending.len() - 1].to_vec()
        } else {
            let twin = self.exclusive_twin.get(&scalar).copied();
            let mut n: Pending = pending
                .iter()
                .filter(|item| !matches!((item, twin), (PendingItem::Mark(c), Some(t)) if *c == t))
                .copied()
                .collect();
            n.push(PendingItem::Mark(scalar));
            n
        };
        Step { edit: Edit::Noop, pending: next, chain_broken: None }
    }

    /// Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form.
    fn apply_mark(&self, m: &Mark, pending: &Pending, secondary: bool) -> Step {
        let scalar = if secondary { m.double.unwrap_or(m.mark) } else { m.mark };
        let spacing = if secondary && m.double.is_some() { m.double_spacing } else { m.spacing };
        if !spacing {
            let cycle = if secondary { &m.double_cycle } else { &m.cycle };
            return self.pending_diacritic(scalar, pending, cycle);
        }
        let f = self.flush(pending);
        let mut text = match &f.edit {
            Edit::Insert { text } => text.clone(),
            _ => String::new(),
        };
        text.push(scalar);
        Step { edit: Edit::Insert { text }, pending: vec![], chain_broken: None }
    }

    /// Emit a base glyph, committing any pending prefix diacritics onto it.
    fn emit_base(&self, glyph: &str, pending: &Pending) -> Step {
        if pending.is_empty() {
            return Step { edit: Edit::Insert { text: glyph.to_string() }, pending: vec![], chain_broken: None };
        }
        // Raise/lower substitutes the glyph itself; any marks then ride the result.
        let op_index = pending.iter().position(|i| matches!(i, PendingItem::Raise | PendingItem::Lower));
        if let Some(idx) = op_index {
            let op = pending[idx];
            let rest: Vec<char> = pending
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != idx)
                .filter_map(|(_, item)| match item {
                    PendingItem::Mark(c) => Some(*c),
                    _ => None,
                })
                .collect();
            let base_char = glyph.chars().next();
            let moved = base_char.and_then(|g| {
                let table = if op == PendingItem::Raise { &self.sups } else { &self.subs };
                table.get(&g).copied()
            });
            let base = moved.map(String::from).unwrap_or_else(|| glyph.to_string());
            let text = Self::recompose(&base, &rest);
            return Step { edit: Edit::Insert { text }, pending: vec![], chain_broken: None };
        }
        // tilde overlay: middle-tilde atoms — ɫ is also a digraph, l⇧Q
        if pending.len() == 1 && pending[0] == PendingItem::Mark('\u{0334}')
            && let Some(g) = glyph.chars().next()
                && let Some(t) = tilded(g) {
                    return Step { edit: Edit::Insert { text: t.to_string() }, pending: vec![], chain_broken: None };
                }
        // stroke overlay: orthographic letters are precomposed (⌥y l → ł, ⌥y d → đ)
        if pending.len() == 1 && pending[0] == PendingItem::Mark('\u{0335}')
            && let Some(g) = glyph.chars().next()
                && let Some(s) = stroked(g) {
                    return Step { edit: Edit::Insert { text: s.to_string() }, pending: vec![], chain_broken: None };
                }
        let marks: Vec<char> = pending
            .iter()
            .map(|item| match item {
                PendingItem::Mark(c) => *c,
                _ => '\0',
            })
            .collect();
        let text = Self::recompose(glyph, &marks);
        Step { edit: Edit::Insert { text }, pending: vec![], chain_broken: None }
    }

    /// ⌥z / ⌥⇧z: arm the raise or the lower. Same chord again lifts it; the
    /// twin replaces.
    fn pending_operator(op: PendingItem, pending: &Pending) -> Step {
        let next: Pending = if pending.contains(&op) {
            pending.iter().copied().filter(|&i| i != op).collect()
        } else {
            let twin = if op == PendingItem::Raise { PendingItem::Lower } else { PendingItem::Raise };
            let mut n: Pending = pending.iter().copied().filter(|&i| i != twin).collect();
            n.push(op);
            n
        };
        Step { edit: Edit::Noop, pending: next, chain_broken: None }
    }

    /// ⌥j / ⌥⇧j: attach the affricate joiner, or emit the standalone
    /// spacing tie.
    fn emit_joiner(&self, text_before: &str, start: char, pending: &Pending) -> Step {
        const TIE: char = '\u{0361}'; // ͡
        const OVERTIE: char = '\u{2040}'; // ⁀
        const UNDERTIE: char = '\u{203F}'; // ‿
        let spacing = if start == TIE { OVERTIE } else { UNDERTIE };
        if pending.is_empty() {
            let last = Self::last_cluster(text_before).and_then(|c| c.chars().next_back());
            if let Some(last) = last {
                let combining_tie = matches!(last, '\u{0361}' | '\u{035C}' | '\u{0362}');
                let spacing_tie = matches!(last, OVERTIE | UNDERTIE);
                if combining_tie || spacing_tie {
                    return Step {
                        edit: Edit::Replace { length: 1, text: spacing.to_string() },
                        pending: vec![],
                        chain_broken: None,
                    };
                }
            }
            if last.is_none() || last.is_some_and(|c| c.is_whitespace()) {
                return Step { edit: Edit::Insert { text: spacing.to_string() }, pending: vec![], chain_broken: None };
            }
        }
        self.emit_base(&start.to_string(), pending)
    }

    // ------------------------------------------------------------ engine

    /// The IPAbet keystroke handler, mirroring the IME's handle().
    ///
    /// Shift-chaining lets a capital continue a transcription (ʃ⇧I⇧H → ʃɪ),
    /// gated on a *broken* flag the caller threads in. This owns the flag;
    /// handle_key_core only reads it.
    pub fn handle_key(&self, text_before: &str, k: &Keystroke, pending: &Pending, chain_broken: bool) -> Step {
        let broken_in = chain_broken || k.shift_broke;
        let mut step = self.handle_key_core(text_before, k, pending, !broken_in);
        let seg = match &step.edit {
            Edit::Replace { .. } => true,
            Edit::Insert { text } => !text.is_ascii(),
            _ => false,
        };
        step.chain_broken = Some(if seg { false } else { broken_in });
        step
    }

    fn with_flush(&self, edit: Edit, pending: &Pending, k: &Keystroke, for_pass_use_native: bool) -> Step {
        if pending.is_empty() {
            return Step { edit, pending: pending.clone(), chain_broken: None };
        }
        let pre = self.commit_string(pending);
        if pre.is_empty() {
            return Step { edit, pending: vec![], chain_broken: None };
        }
        match edit {
            Edit::Insert { text } => {
                Step { edit: Edit::Insert { text: pre + &text }, pending: vec![], chain_broken: None }
            }
            Edit::Pass => {
                let native = if for_pass_use_native { native_char(k) } else { String::new() };
                Step { edit: Edit::Insert { text: pre + &native }, pending: vec![], chain_broken: None }
            }
            other => Step { edit: other, pending: vec![], chain_broken: None },
        }
    }

    /// A capital digraph capitalizes its result; a plain-ASCII result is
    /// excluded (⇧T⇧J stays "TJ"). ʔ is caseless in Unicode — Ɂ is the one
    /// hand map.
    fn capital_of(low: char) -> Option<char> {
        if low == '\u{0294}' {
            return Some('\u{0241}'); // ʔ → Ɂ
        }
        let up = low.to_uppercase().next().unwrap_or(low);
        if up != low && (up as u32) > 0x7f {
            Some(up)
        } else {
            None
        }
    }

    fn handle_key_core(&self, text_before: &str, k: &Keystroke, pending: &Pending, chain_live: bool) -> Step {
        let key = k.key.as_str();
        let shift = k.shift;
        let option = k.option;

        if key == "Escape" && !k.control && !option {
            return if !pending.is_empty() {
                self.flush(pending)
            } else {
                Step { edit: Edit::Pass, pending: pending.clone(), chain_broken: None }
            };
        }
        if key.chars().count() != 1 {
            return Step { edit: Edit::Pass, pending: pending.clone(), chain_broken: None };
        }
        let kc = key.chars().next().unwrap();

        if k.control {
            if shift && kc.is_ascii_lowercase() {
                let up = kc.to_ascii_uppercase().to_string();
                return self.with_flush(Edit::Insert { text: up }, pending, k, false);
            }
            return Step { edit: Edit::Pass, pending: pending.clone(), chain_broken: None };
        }

        if kc == ' ' && !option && !pending.is_empty() {
            let f = self.flush(pending);
            return if f.edit == Edit::Noop {
                Step { edit: Edit::Pass, pending: vec![], chain_broken: None }
            } else {
                f
            };
        }

        if option && shift {
            if kc == 'j' {
                const TIE_BELOW: char = '\u{035C}'; // ͜
                return self.emit_joiner(text_before, TIE_BELOW, pending);
            }
            if kc == 'z' {
                return Self::pending_operator(PendingItem::Lower, pending);
            }
            if kc == '[' {
                return self.with_flush(Edit::Insert { text: self.quote_quad()[1].to_string() }, pending, k, false);
            }
            if kc == ']' {
                return self.with_flush(Edit::Insert { text: self.quote_quad()[3].to_string() }, pending, k, false);
            }
            if let Some(m) = self.opt_marks.get(&kc)
                && m.double.is_some() {
                    return self.apply_mark(m, pending, true);
                }
            if kc.is_ascii_digit() {
                if let Some(over) = self.opt_shift_digits.get(&kc) {
                    return self.with_flush(Edit::Insert { text: over.clone() }, pending, k, false);
                }
                if self.letters.contains_key(&kc.to_string()) {
                    let text = shifted_digit(kc).map(String::from).unwrap_or_else(|| kc.to_string());
                    return self.with_flush(Edit::Insert { text }, pending, k, false);
                }
            }
            return self.with_flush(Edit::Pass, pending, k, true);
        }

        if option {
            if kc == 'j' {
                const TIE: char = '\u{0361}'; // ͡
                return self.emit_joiner(text_before, TIE, pending);
            }
            if kc == '[' {
                return self.with_flush(Edit::Insert { text: self.quote_quad()[0].to_string() }, pending, k, false);
            }
            if kc == ']' {
                return self.with_flush(Edit::Insert { text: self.quote_quad()[2].to_string() }, pending, k, false);
            }
            if kc == 'r' && pending.is_empty()
                && let Some(p) = Self::last_cluster(text_before) {
                    let (base, marks) = Self::decompose(p);
                    if base == "ə" {
                        let text = Self::recompose("ɚ", &marks);
                        return self.with_flush(
                            Edit::Replace { length: p.chars().count(), text },
                            pending,
                            k,
                            false,
                        );
                    }
                    if base == "ɜ" {
                        let text = Self::recompose("ɝ", &marks);
                        return self.with_flush(
                            Edit::Replace { length: p.chars().count(), text },
                            pending,
                            k,
                            false,
                        );
                    }
                }
            if kc == '.' && pending.len() == 1 && pending[0] == PendingItem::Mark('\u{0307}') {
                return Step {
                    edit: Edit::Insert { text: "\u{00B7}".to_string() },
                    pending: vec![],
                    chain_broken: None,
                };
            }
            if let Some(m) = self.opt_marks.get(&kc) {
                return self.apply_mark(m, pending, false);
            }
            if kc == 'z' {
                return Self::pending_operator(PendingItem::Raise, pending);
            }
            return self.with_flush(Edit::Pass, pending, k, true);
        }

        if kc.is_ascii_digit() {
            if !shift && !pending.is_empty() {
                return self.emit_base(&kc.to_string(), pending);
            }
            if !shift {
                return self.with_flush(Edit::Pass, pending, k, true);
            }
        }

        if k.caps_lock && !shift && kc.is_ascii_lowercase() {
            return self.emit_base(&kc.to_ascii_uppercase().to_string(), pending);
        }

        // The modifier character: the shifted letter's capital, or the
        // shifted digit's US symbol (the spec spells ⇧5 as "%": e% → ɜ).
        let s: String = if shift {
            shifted_digit(kc).map(String::from).unwrap_or_else(|| kc.to_ascii_uppercase().to_string())
        } else {
            kc.to_string()
        };

        let p = if pending.is_empty() { Self::last_cluster(text_before) } else { None };
        if let Some(p) = p {
            let (mut base, marks) = Self::decompose(p);

            if shift && !k.caps_lock && base.chars().count() == 1 && base.chars().next().unwrap().is_ascii_uppercase() {
                let before_len = text_before.len() - p.len();
                let before = &text_before[..before_len];
                let p2 = Self::last_cluster(before);
                let p2_segment = p2.is_some_and(|seg| {
                    seg.chars().any(|c| {
                        (c as u32) > 127
                            && (c.is_alphabetic() || unicode_normalization::char::is_combining_mark(c))
                    })
                });
                if p2_segment && chain_live {
                    base = base.to_ascii_lowercase();
                } else if self.capital_digraphs {
                    let low_key = format!("{}{s}", base.to_ascii_lowercase());
                    if let Some(low) = self.transforms.get(&low_key)
                        && let Some(up) = Self::capital_of(low.chars().next().unwrap()) {
                            let text = Self::recompose(&up.to_string(), &marks);
                            return Step {
                                edit: Edit::Replace { length: p.chars().count(), text },
                                pending: vec![],
                                chain_broken: None,
                            };
                        }
                }
            }
            // The shifted digit is the digit's capital plane (⇧5⇧H → Ə).
            if self.capital_digraphs && shift && chain_live && !k.caps_lock
                && let Some(digit) = (0u8..10).map(|d| (d, shifted_digit(char::from(b'0' + d))))
                    .find_map(|(d, sd)| (sd == Some(base.as_str())).then_some(d))
                {
                    let digit_key = format!("{digit}{s}");
                    if let Some(low) = self.transforms.get(&digit_key)
                        && let Some(up) = Self::capital_of(low.chars().next().unwrap()) {
                            let text = Self::recompose(&up.to_string(), &marks);
                            return Step {
                                edit: Edit::Replace { length: p.chars().count(), text },
                                pending: vec![],
                                chain_broken: None,
                            };
                        }
                }
            let combo_key = format!("{base}{s}");
            if let Some(combo) = self.transforms.get(&combo_key) {
                let text = Self::recompose(combo, &marks);
                return Step {
                    edit: Edit::Replace { length: p.chars().count(), text },
                    pending: vec![],
                    chain_broken: None,
                };
            }
            // A raised or lowered glyph still transforms: unraise,
            // transform, re-raise.
            if base.chars().count() == 1 {
                let bc = base.chars().next().unwrap();
                let is_sup = self.unsup.contains_key(&bc);
                let plain = if is_sup { self.unsup.get(&bc) } else { self.unsub.get(&bc) };
                if let Some(&plain) = plain {
                    let pk = format!("{plain}{s}");
                    if let Some(t) = self.transforms.get(&pk) {
                        let tc = t.chars().next().unwrap();
                        let table = if is_sup { &self.sups } else { &self.subs };
                        if let Some(&back) = table.get(&tc) {
                            let text = Self::recompose(&back.to_string(), &marks);
                            return Step {
                                edit: Edit::Replace { length: p.chars().count(), text },
                                pending: vec![],
                                chain_broken: None,
                            };
                        }
                    }
                }
            }
        }

        // letter / click base glyph — committing any pending prefix diacritics
        if let Some(glyph) = self.letters.get(&s) {
            return self.emit_base(glyph, pending);
        }

        // A pending accent absorbs onto a CAPITAL base (⌥u ⇧A → Ä).
        if !pending.is_empty() && s.chars().count() == 1 && s.chars().next().unwrap().is_ascii_uppercase() {
            return self.emit_base(&s, pending);
        }

        self.with_flush(Edit::Pass, pending, k, true)
    }

    /// Backspace: marks are PREFIX keystrokes, so undoing the last
    /// keystroke of a marked cluster deletes the base and re-arms the mark
    /// stack as pending — the next base absorbs it (ãː ⌫ o → õ). Ties are
    /// postfix joiners typed after their base, so a trailing tie peels
    /// instead. A bare glyph passes so the host deletes it natively.
    pub fn handle_backspace(&self, text_before: &str, pending: &Pending) -> Step {
        if !pending.is_empty() {
            let mut next = pending.clone();
            next.pop();
            return Step { edit: Edit::Noop, pending: next, chain_broken: None };
        }
        let p = match Self::last_cluster(text_before) {
            Some(p) => p,
            None => return Step { edit: Edit::Pass, pending: vec![], chain_broken: None },
        };
        let (base, marks) = Self::decompose(p);
        if marks.is_empty() || base.is_empty() {
            return Step { edit: Edit::Pass, pending: vec![], chain_broken: None };
        }
        let last_mark = *marks.last().unwrap();
        if matches!(last_mark, '\u{0361}' | '\u{035C}' | '\u{0362}') {
            let text = Self::recompose(&base, &marks[..marks.len() - 1]);
            return Step {
                edit: Edit::Replace { length: p.chars().count(), text },
                pending: vec![],
                chain_broken: None,
            };
        }
        let pending: Pending = marks.into_iter().map(PendingItem::Mark).collect();
        Step { edit: Edit::Replace { length: p.chars().count(), text: String::new() }, pending, chain_broken: None }
    }

    /// ⌃⌫ — unconvert: the committed transform before the cursor becomes
    /// its literal keystroke spelling (θ → "tH"), stateless via the reverse
    /// map. The cluster is matched whole and canonically: ä and ç decompose
    /// under NFD, but their marks are part of the glyph, not something the
    /// user stacked on.
    pub fn handle_unconvert(&self, text_before: &str, pending: &Pending) -> Step {
        if !pending.is_empty() {
            return self.handle_backspace(text_before, pending);
        }
        if let Some(p) = Self::last_cluster(text_before) {
            let whole: String = p.chars().nfc().collect();
            let low: String = whole.chars().flat_map(|c| c.to_lowercase()).collect();
            if let Some(key) = self.unconvert_key.get(&low) {
                let text = if whole == low {
                    key.clone()
                } else {
                    key.chars().flat_map(|c| c.to_uppercase()).collect()
                };
                return Step {
                    edit: Edit::Replace { length: p.chars().count(), text },
                    pending: vec![],
                    chain_broken: None,
                };
            }
        }
        Step { edit: Edit::Pass, pending: vec![], chain_broken: None }
    }
}

// --------------------------------------------------------------- helpers

fn permutations(items: &[char]) -> Vec<Vec<char>> {
    if items.len() <= 1 {
        return vec![items.to_vec()];
    }
    let mut out = Vec::new();
    for i in 0..items.len() {
        let mut rest = items.to_vec();
        let head = rest.remove(i);
        for mut p in permutations(&rest) {
            p.insert(0, head);
            out.push(p);
        }
    }
    out
}

// A contour tone is its level tones typed in order. Where Unicode encodes
// that sequence as one character, it is emitted rather than stacking the
// marks, so ⌥e ⌥⇧e spells a contour instead of the twin replacing its partner.
fn contour_atom(seq: &[char]) -> Option<char> {
    const CONTOURS: &[(&[char], char)] = &[
        (&['\u{030F}', '\u{030B}'], '\u{030C}'),
        (&['\u{030B}', '\u{030F}'], '\u{0302}'),
        (&['\u{0301}', '\u{030B}'], '\u{1DC4}'),
        (&['\u{030F}', '\u{0300}'], '\u{1DC5}'),
        (&['\u{0304}', '\u{0301}', '\u{0304}'], '\u{1DC8}'),
        (&['\u{0304}', '\u{0300}'], '\u{1DC6}'),
        (&['\u{0301}', '\u{0304}'], '\u{1DC7}'),
        (&['\u{0301}', '\u{0300}', '\u{0301}'], '\u{1DC9}'),
    ];
    CONTOURS.iter().find(|(s, _)| *s == seq).map(|(_, atom)| *atom)
}

// NFC cannot fuse an overlay, so every combination Unicode encodes
// atomically must be emitted atomic — a raw combining render is a permanent
// homoglyph (i̵ beside ɨ fails search forever). Diagonal-slash atoms stay
// out, ł excepted. Hand-authored constants, not spec-driven, same as the JS
// and C engines.
fn stroked(c: char) -> Option<char> {
    const TABLE: &[(char, char)] = &[
        ('l', 'ł'), ('L', 'Ł'), ('d', 'đ'), ('D', 'Đ'), ('t', 'ŧ'), ('T', 'Ŧ'), ('g', 'ǥ'), ('G', 'Ǥ'),
        ('h', 'ħ'), ('H', 'Ħ'), ('b', 'ƀ'), ('B', 'Ƀ'), ('z', 'ƶ'), ('Z', 'Ƶ'),
        ('i', 'ɨ'), ('I', 'Ɨ'), ('u', 'ʉ'), ('U', 'Ʉ'), ('o', 'ɵ'), ('O', 'Ɵ'), ('j', 'ɟ'),
        ('r', 'ɍ'), ('R', 'Ɍ'), ('y', 'ɏ'), ('Y', 'Ɏ'), ('c', 'ȼ'), ('C', 'Ȼ'), ('p', 'ᵽ'), ('P', 'Ᵽ'),
        ('k', 'ꝁ'), ('K', 'Ꝁ'), ('2', 'ƻ'),
    ];
    TABLE.iter().find(|(k, _)| *k == c).map(|(_, v)| *v)
}

// Unicode's middle-tilde letters, plus the dark ls.
fn tilded(c: char) -> Option<char> {
    const TABLE: &[(char, char)] = &[
        ('l', 'ɫ'), ('L', 'Ɫ'), ('b', 'ᵬ'), ('d', 'ᵭ'), ('f', 'ᵮ'), ('m', 'ᵯ'), ('n', 'ᵰ'),
        ('p', 'ᵱ'), ('r', 'ᵲ'), ('s', 'ᵴ'), ('t', 'ᵵ'), ('z', 'ᵶ'),
    ];
    TABLE.iter().find(|(k, _)| *k == c).map(|(_, v)| *v)
}

// US shift plane for digits — matches SHIFTED_DIGITS in the JS engine.
fn shifted_digit(d: char) -> Option<&'static str> {
    match d {
        '0' => Some(")"), '1' => Some("!"), '2' => Some("@"), '3' => Some("#"), '4' => Some("$"),
        '5' => Some("%"), '6' => Some("^"), '7' => Some("&"), '8' => Some("*"), '9' => Some("("),
        _ => None,
    }
}

fn shifted_punct(c: char) -> Option<&'static str> {
    match c {
        '`' => Some("~"), '-' => Some("_"), '=' => Some("+"), '[' => Some("{"), ']' => Some("}"),
        '\\' => Some("|"), ';' => Some(":"), '\'' => Some("\""), ',' => Some("<"), '.' => Some(">"),
        '/' => Some("?"),
        _ => None,
    }
}

/// The native (US) character a keystroke would type, for pass fallbacks.
pub fn native_char(k: &Keystroke) -> String {
    if k.key.chars().count() != 1 {
        return String::new();
    }
    let kc = k.key.chars().next().unwrap();
    if k.shift && kc.is_ascii_alphabetic() {
        return kc.to_ascii_uppercase().to_string();
    }
    if k.shift && kc.is_ascii_digit() {
        return shifted_digit(kc).unwrap_or("").to_string();
    }
    if k.shift {
        return shifted_punct(kc).map(String::from).unwrap_or_else(|| kc.to_string());
    }
    if k.option {
        return String::new(); // host Option typography is host-specific
    }
    kc.to_string()
}

/// Applies `edit` to `text_before`. `native` is what a PASS edit appends
/// (from native_char), matching applyEdit(text, edit, native).
pub fn apply_edit(text_before: &str, edit: &Edit, native: &str) -> String {
    match edit {
        Edit::Insert { text } => format!("{text_before}{text}"),
        Edit::Replace { length, text } => {
            let cps: Vec<char> = text_before.chars().collect();
            let keep = cps.len().saturating_sub(*length);
            let head: String = cps[..keep].iter().collect();
            format!("{head}{text}")
        }
        Edit::Pass => format!("{text_before}{native}"),
        Edit::Noop => text_before.to_string(),
    }
}

/// The byte length of the last grapheme cluster (a base codepoint plus any
/// trailing combining marks) in `text_before`, or 0 if it's empty. For a
/// host implementing its own native single-character delete when the engine
/// declines a backspace (PASS).
pub fn last_cluster_byte_len(text_before: &str) -> usize {
    Engine::last_cluster(text_before).map(str::len).unwrap_or(0)
}
