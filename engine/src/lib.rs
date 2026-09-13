// The IPAbet engine: a generic LDML keyboard3 transform executor (UTS #35
// part 7) plus the IME contract three shells link through the C ABI in
// ffi.rs (IBus, fcitx5, the Windows text service). The composition IS the
// transforms in spec/ipabet.xml — a keystroke maps to a key's output through
// the layers, that output is appended to a buffer, and the transformGroups
// run as ordered passes, first match per group, to a fixpoint. Markers
// (\m{name}) are atomic tokens carried through the passes and resolved at
// output. The buffer is NFD while transforms run and NFC when it leaves.
//
// Mirrors js/src/ldml.ts and is verified byte-for-byte against every case in
// spec/parity-vectors.json (tests/parity.rs). `Edit::Replace.length` is a
// codepoint count — nothing here is ever UTF-16.

pub mod ffi;

use regex::{Captures, Regex};
use roxmltree::{Document, Node};
use std::collections::{HashMap, HashSet};
use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;
use unicode_segmentation::UnicodeSegmentation;

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
    /// Replace the last `length` CODEPOINTS before the cursor with `text`.
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

pub struct Step {
    pub edit: Edit,
    pub pending: Pending,
    pub chain_broken: Option<bool>,
}

// ---------------------------------------------------------------- engine

const PROTECT: char = '\u{F8FE}';
const ROWS: [&str; 4] = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];
const OPERATORS: [&str; 2] = ["raise", "lower"];

struct Rule {
    re: Regex,
    to: String,
}
struct Group {
    when: Option<String>,
    rules: Vec<Rule>,
}

pub struct Engine {
    keys: HashMap<String, String>,
    layers: HashMap<String, Vec<Vec<String>>>,
    groups: Vec<Group>,
    displays: HashMap<String, String>,
    marker_cp: HashMap<String, char>,
    cp_marker: HashMap<char, String>,
    marker_glyph: HashMap<String, char>,
    glyph_marker: HashMap<char, char>,
    unconvert: HashMap<String, String>,
    postfix: HashSet<String>,
    quote_locales: HashMap<String, [char; 4]>,
    quote_default: String,
    quote_active: String,
    capital_digraphs: bool,
}

struct Settings {
    capital_digraphs: bool,
    capital_digit_digraphs: bool,
}

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
/// A shifted glyph back to its physical key.
fn unshift(label: &str) -> Option<char> {
    let c = label.chars().next()?;
    for d in '0'..='9' {
        if shifted_digit(d) == Some(label) { return Some(d); }
    }
    for p in ['`', '-', '=', '[', ']', '\\', ';', '\'', ',', '.', '/'] {
        if shifted_punct(p) == Some(label) { return Some(p); }
    }
    let _ = c;
    None
}

/// General category L — the \p{L} half of the IPA-segment test.
fn is_letter(c: char) -> bool {
    use unicode_general_category::{get_general_category, GeneralCategory};
    matches!(
        get_general_category(c),
        GeneralCategory::UppercaseLetter
            | GeneralCategory::LowercaseLetter
            | GeneralCategory::TitlecaseLetter
            | GeneralCategory::ModifierLetter
            | GeneralCategory::OtherLetter
    )
}
fn is_ipa(c: char) -> bool {
    (c as u32) > 0x7f && (is_letter(c) || is_combining_mark(c))
}

/// The bracket-key quotes per locale — [open1, close1, open2, close2]: CLDR
/// <delimiters> data the engine owns, not keyboard layout.
fn builtin_quotes() -> (String, HashMap<String, [char; 4]>) {
    let data: [(&str, [char; 4]); 7] = [
        ("en", ['“', '”', '‘', '’']),
        ("de", ['„', '“', '‚', '‘']),
        ("fr", ['«', '»', '‹', '›']),
        ("ch", ['»', '«', '›', '‹']),
        ("pl", ['„', '”', '«', '»']),
        ("ru", ['«', '»', '„', '“']),
        ("sv", ['”', '”', '’', '’']),
    ];
    ("en".to_string(), data.iter().map(|(k, v)| (k.to_string(), *v)).collect())
}

fn expand_u(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("\\u{") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 3..];
        match after.find('}') {
            Some(j) => {
                match u32::from_str_radix(&after[..j], 16).ok().and_then(char::from_u32) {
                    Some(c) => out.push(c),
                    None => out.push_str(&rest[i..i + 3 + j + 1]),
                }
                rest = &after[j + 1..];
            }
            None => {
                out.push_str(rest);
                return out;
            }
        }
    }
    out.push_str(rest);
    out
}

fn class_escape(c: char) -> String {
    if "\\]^-[&~".contains(c) { format!("\\{c}") } else { c.to_string() }
}

fn fuse_marks(built: &str, rest: &[char]) -> String {
    let flat: String = built.chars().chain(rest.iter().copied()).collect();
    let mut best: String = flat.chars().nfc().collect();
    let built_len = built.chars().count();
    for (i, mark) in rest.iter().enumerate() {
        let attempt: String = built.chars().chain(std::iter::once(*mark)).collect();
        let candidate: String = attempt.chars().nfc().collect();
        if candidate.chars().count() != built_len {
            continue;
        }
        let mut without: Vec<char> = rest.to_vec();
        without.remove(i);
        let s = fuse_marks(&candidate, &without);
        if s.chars().count() < best.chars().count() {
            best = s;
        }
    }
    best
}

impl Engine {
    pub fn from_ldml(xml: &str) -> Result<Engine, String> {
        let doc = Document::parse(xml).map_err(|e| e.to_string())?;
        let all = |t: &'static str| -> Vec<Node> { doc.descendants().filter(|n| n.tag_name().name() == t).collect() };
        let (quote_default, quote_locales) = builtin_quotes();
        let mut e = Engine {
            keys: HashMap::new(),
            layers: HashMap::new(),
            groups: Vec::new(),
            displays: HashMap::new(),
            marker_cp: HashMap::new(),
            cp_marker: HashMap::new(),
            marker_glyph: HashMap::new(),
            glyph_marker: HashMap::new(),
            unconvert: HashMap::new(),
            postfix: HashSet::new(),
            quote_locales,
            quote_active: quote_default.clone(),
            quote_default,
            capital_digraphs: false,
        };
        for n in all("key") {
            if let (Some(id), Some(out)) = (n.attribute("id"), n.attribute("output")) {
                let v = e.encode_markers(out);
                e.keys.insert(id.to_string(), v);
            }
        }
        for layer in all("layer") {
            let mods = layer.attribute("modifiers").unwrap_or("none").to_string();
            let rows = layer
                .children()
                .filter(|r| r.tag_name().name() == "row")
                .map(|r| r.attribute("keys").unwrap_or("").split_whitespace().map(String::from).collect())
                .collect();
            e.layers.insert(mods, rows);
        }
        for n in all("display") {
            if let (Some(out), Some(d)) = (n.attribute("output"), n.attribute("display")) {
                if let Some(name) = out.strip_prefix("\\m{").and_then(|s| s.strip_suffix('}')) {
                    e.displays.insert(name.to_string(), d.to_string());
                }
            }
        }
        let spacing: String = e
            .keys
            .iter()
            .filter(|(id, o)| (id.starts_with("sp_") || id.starts_with("os_") || id.starts_with("q_")) && o.chars().count() == 1)
            .map(|(_, o)| class_escape(o.chars().next().unwrap()))
            .collect();
        let base = format!("([[\\p{{L}}\\p{{N}}]--[{spacing}]]\\p{{M}}*)");
        for g in all("transformGroup") {
            let start = g.range().start;
            let when = xml.get(..start).and_then(|before| {
                let i = before.rfind("@optional")?;
                if before.len() - i > 200 {
                    return None;
                }
                let name: String = before[i + 9..].trim_start().chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
                if name.is_empty() { None } else { Some(name) }
            });
            let mut rules = Vec::new();
            for t in g.children().filter(|n| n.tag_name().name() == "transform") {
                let (Some(from), Some(to)) = (t.attribute("from"), t.attribute("to")) else { continue };
                let mut src = expand_u(&e.encode_markers(from));
                src = src.replace("(.)", &base);
                let re = Regex::new(&format!("(?:{src})$")).map_err(|err| format!("{from}: {err}"))?;
                rules.push(Rule { re, to: expand_u(&e.encode_markers(to)) });
                if let Some(rest) = from.strip_prefix("(.)\\m{") {
                    if let Some(j) = rest.find('}') {
                        e.postfix.insert(rest[..j].to_string());
                    }
                }
                // marker -> its combining char, from \m{X}(.) -> $1\u{...} (tie: (.)\m{X}(.))
                let f = from.strip_prefix("(.)").unwrap_or(from);
                let t2 = to.strip_suffix("$2").unwrap_or(to);
                if let (Some(name), Some(hx)) = (
                    f.strip_prefix("\\m{").and_then(|s| s.strip_suffix("}(.)")),
                    t2.strip_prefix("$1\\u{").and_then(|s| s.strip_suffix('}')),
                ) {
                    if let Some(ch) = u32::from_str_radix(hx, 16).ok().and_then(char::from_u32) {
                        e.marker_glyph.insert(name.to_string(), ch);
                    }
                }
                // digraph B(\p{M}*)M -> G$1 gives the unconvert spelling G -> "BM"
                if let Some(idx) = from.find("(\\p{M}*)") {
                    let b = &from[..idx];
                    let m = &from[idx + 8..];
                    if b.chars().count() == 1 && !b.starts_with('\\') {
                        if let Some(gl) = to.strip_suffix("$1") {
                            if gl.chars().count() == 1 && e.keys.get(&format!("b_{gl}")).map(String::as_str) != Some(gl) {
                                e.unconvert.entry(gl.to_string()).or_insert_with(|| format!("{b}{m}"));
                            }
                        }
                    }
                }
            }
            e.groups.push(Group { when, rules });
        }
        for (name, ch) in e.marker_glyph.clone() {
            let pua = e.marker(&name);
            e.glyph_marker.insert(ch, pua);
        }
        Ok(e)
    }

    fn marker(&mut self, name: &str) -> char {
        if let Some(c) = self.marker_cp.get(name) {
            return *c;
        }
        let c = char::from_u32(0xE000 + self.marker_cp.len() as u32).unwrap();
        self.marker_cp.insert(name.to_string(), c);
        self.cp_marker.insert(c, name.to_string());
        c
    }
    fn encode_markers(&mut self, s: &str) -> String {
        let mut out = String::new();
        let mut rest = s;
        while let Some(i) = rest.find("\\m{") {
            out.push_str(&rest[..i]);
            let after = &rest[i + 3..];
            let Some(j) = after.find('}') else { out.push_str(rest); return out };
            let c = self.marker(&after[..j]);
            out.push(c);
            rest = &after[j + 1..];
        }
        out.push_str(rest);
        out
    }
    fn is_marker(&self, c: char) -> bool {
        self.cp_marker.contains_key(&c)
    }

    pub fn set_capital_digraphs(&mut self, on: bool) {
        self.capital_digraphs = on;
    }
    pub fn set_quote_locale(&mut self, locale: &str) {
        self.quote_active = if self.quote_locales.contains_key(locale) { locale.to_string() } else { self.quote_default.clone() };
    }

    // ------------------------------------------------------------ keys

    fn key_output(&self, k: &Keystroke) -> Option<String> {
        let label = k.key.as_str();
        if !k.shift && !k.option && unshift(label).is_some() {
            return Some(label.to_string());
        }
        let c = label.chars().next()?;
        let phys = if label.chars().count() == 1 && c.is_ascii_alphabetic() {
            c.to_ascii_lowercase()
        } else {
            unshift(label).unwrap_or(c)
        };
        let mut pos = None;
        for (r, row) in ROWS.iter().enumerate() {
            if let Some(ci) = row.chars().position(|x| x == phys) {
                pos = Some((r, ci));
                break;
            }
        }
        let (r, ci) = pos?;
        let layer = match (k.option, k.shift) {
            (true, true) => "altR shift",
            (true, false) => "altR",
            (false, true) => "shift",
            (false, false) => "none",
        };
        let id = self.layers.get(layer)?.get(r)?.get(ci)?;
        if id == "gap" {
            return None;
        }
        let slot = match id.as_str() {
            "q_open_primary" => Some(0),
            "q_close_primary" => Some(1),
            "q_open_secondary" => Some(2),
            "q_close_secondary" => Some(3),
            _ => None,
        };
        if let Some(s) = slot {
            let quad = self.quote_locales.get(&self.quote_active).or_else(|| self.quote_locales.get(&self.quote_default))?;
            return Some(quad[s].to_string());
        }
        self.keys.get(id).cloned()
    }

    // ------------------------------------------------------- transforms

    fn apply_to(to: &str, caps: &Captures) -> String {
        let mut out = String::new();
        let mut chars = to.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '$' {
                if let Some(d) = chars.peek().and_then(|d| d.to_digit(10)) {
                    chars.next();
                    if let Some(m) = caps.get(d as usize) {
                        out.push_str(m.as_str());
                    }
                    continue;
                }
            }
            out.push(c);
        }
        out
    }
    fn sweep(&self, mut buf: String, on: &Settings) -> String {
        for g in &self.groups {
            if let Some(w) = &g.when {
                let enabled = match w.as_str() {
                    "capitalDigraphs" => on.capital_digraphs,
                    "capitalDigitDigraphs" => on.capital_digit_digraphs,
                    _ => false,
                };
                if !enabled {
                    continue;
                }
            }
            for r in &g.rules {
                if let Some(caps) = r.re.captures(&buf) {
                    let m = caps.get(0).unwrap();
                    let mut next = buf[..m.start()].to_string();
                    next.push_str(&Self::apply_to(&r.to, &caps));
                    next.push_str(&buf[m.end()..]);
                    buf = next;
                    break;
                }
            }
        }
        buf
    }
    fn run_passes(&self, mut buf: String, on: &Settings) -> String {
        for _ in 0..32 {
            let next = self.sweep(buf.clone(), on);
            if next == buf {
                break;
            }
            buf = next;
        }
        buf
    }

    fn last_base(chars: &[char]) -> usize {
        let mut i = chars.len();
        while i > 0 && is_combining_mark(chars[i - 1]) {
            i -= 1;
        }
        i.saturating_sub(1)
    }
    fn fuse_tail(&self, buf: String, typed: &[char]) -> String {
        let chars: Vec<char> = buf.chars().collect();
        let i = Self::last_base(&chars);
        let cluster: String = chars[i..].iter().collect();
        let nfd: Vec<char> = cluster.chars().nfd().collect();
        if nfd.len() < 3 || self.is_marker(nfd[0]) {
            return buf;
        }
        let marks = &nfd[1..];
        let mut a: Vec<char> = typed.to_vec();
        let mut b: Vec<char> = marks.to_vec();
        a.sort_unstable();
        b.sort_unstable();
        let order: &[char] = if a == b { typed } else { marks };
        let head: String = chars[..i].iter().collect();
        head + &fuse_marks(&nfd[0].to_string(), order)
    }

    fn compose(&self, buf: &str, k: &Keystroke, o: &str, on: &Settings, broken_in: bool) -> String {
        let buf: String = buf.chars().nfd().collect();
        let pre: Vec<char> = buf.chars().collect();
        let mut j = pre.len();
        while j > 0 && self.is_marker(pre[j - 1]) {
            j -= 1;
        }
        let typed: Vec<char> = pre[j..]
            .iter()
            .filter_map(|c| self.cp_marker.get(c).and_then(|n| self.marker_glyph.get(n)).copied())
            .collect();
        let kc = k.key.chars().next().unwrap_or('\0');
        if k.shift && !k.option && !k.caps_lock && k.key.chars().count() == 1 && kc.is_ascii_alphabetic() && !broken_in {
            if pre.len() >= 2 {
                let last = pre[pre.len() - 1];
                let prev = pre[pre.len() - 2];
                if last.is_ascii_uppercase() && is_ipa(prev) {
                    let mut lowered: String = pre[..pre.len() - 1].iter().collect();
                    lowered.push(last.to_ascii_lowercase());
                    lowered.push_str(o);
                    let tried = self.run_passes(lowered.clone(), on);
                    if tried != lowered {
                        return self.fuse_tail(tried, &typed);
                    }
                }
            }
        }
        let mut b = buf;
        b.push_str(o);
        let out = self.run_passes(b, on);
        self.fuse_tail(out, &typed)
    }

    fn resolve(&self, buf: &str, before: &str) -> String {
        let mut out = String::new();
        let mut prev = before.chars().last();
        for c in buf.chars() {
            if c == PROTECT {
                continue;
            }
            let piece: String = match self.cp_marker.get(&c) {
                None => c.to_string(),
                Some(name) => {
                    if OPERATORS.contains(&name.as_str()) {
                        String::new()
                    } else if self.postfix.contains(name) && prev.is_some_and(|p| is_letter(p) || p.is_numeric()) {
                        self.marker_glyph.get(name).map(|g| g.to_string()).unwrap_or_default()
                    } else {
                        match self.displays.get(name) {
                            Some(d) => d.clone(),
                            None => self.marker_glyph.get(name).map(|g| g.to_string()).unwrap_or_default(),
                        }
                    }
                }
            };
            if let Some(last) = piece.chars().last() {
                prev = Some(last);
            }
            out.push_str(&piece);
        }
        out
    }
    // ------------------------------------------------------- the IME contract

    fn to_markers(&self, pending: &Pending) -> String {
        pending
            .iter()
            .filter_map(|p| match p {
                PendingItem::Raise => self.marker_cp.get("raise").copied(),
                PendingItem::Lower => self.marker_cp.get("lower").copied(),
                PendingItem::Mark(c) => self.glyph_marker.get(c).copied(),
            })
            .collect()
    }
    fn from_markers(&self, s: &str) -> Pending {
        s.chars()
            .filter_map(|c| {
                let name = self.cp_marker.get(&c)?;
                match name.as_str() {
                    "raise" => Some(PendingItem::Raise),
                    "lower" => Some(PendingItem::Lower),
                    _ => self.marker_glyph.get(name).map(|g| PendingItem::Mark(*g)),
                }
            })
            .collect()
    }
    fn pending_text(&self, item: &PendingItem) -> String {
        match item {
            PendingItem::Raise => self.displays.get("raise").cloned().unwrap_or_default(),
            PendingItem::Lower => self.displays.get("lower").cloned().unwrap_or_default(),
            PendingItem::Mark(c) => self
                .glyph_marker
                .get(c)
                .and_then(|m| self.cp_marker.get(m))
                .and_then(|n| self.displays.get(n))
                .cloned()
                .unwrap_or_else(|| c.to_string()),
        }
    }
    pub fn preview_string(&self, pending: &Pending) -> String {
        pending.iter().map(|p| self.pending_text(p)).collect()
    }
    /// Commit a pending stack after `before`: a postfix mark (a tie) after a
    /// letter or digit lands as its combining form, otherwise as its clone.
    pub fn commit_text(&self, before: &str, pending: &Pending) -> String {
        self.resolve(&self.to_markers(pending), before).chars().nfc().collect()
    }
    pub fn commit_string(&self, pending: &Pending) -> String {
        self.commit_text("", pending)
    }

    fn last_cluster(text: &str) -> Option<&str> {
        text.graphemes(true).last()
    }
    fn last_clusters(text: &str, n: usize) -> String {
        let segs: Vec<&str> = text.graphemes(true).collect();
        let start = segs.len().saturating_sub(n);
        segs[start..].concat()
    }
    fn replace_cluster(p: &str, text: String) -> Edit {
        Edit::Replace { length: p.chars().count(), text }
    }

    pub fn handle_backspace(&self, text_before: &str, pending: &Pending) -> Step {
        if !pending.is_empty() {
            return Step { edit: Edit::Noop, pending: pending[..pending.len() - 1].to_vec(), chain_broken: None };
        }
        let Some(p) = Self::last_cluster(text_before) else {
            return Step { edit: Edit::Pass, pending: vec![], chain_broken: None };
        };
        let nfd: Vec<char> = p.chars().nfd().collect();
        let base: String = nfd.iter().filter(|c| !is_combining_mark(**c)).collect();
        let marks: Vec<char> = nfd.iter().filter(|c| is_combining_mark(**c)).copied().collect();
        if marks.is_empty() || base.is_empty() {
            return Step { edit: Edit::Pass, pending: vec![], chain_broken: None };
        }
        if matches!(marks[marks.len() - 1], '\u{0361}' | '\u{035C}') {
            let kept: String = base.chars().chain(marks[..marks.len() - 1].iter().copied()).nfc().collect();
            return Step { edit: Self::replace_cluster(p, kept), pending: vec![], chain_broken: None };
        }
        Step { edit: Self::replace_cluster(p, String::new()), pending: marks.into_iter().map(PendingItem::Mark).collect(), chain_broken: None }
    }

    pub fn handle_unconvert(&self, text_before: &str, pending: &Pending) -> Step {
        if !pending.is_empty() {
            return self.handle_backspace(text_before, pending);
        }
        if let Some(p) = Self::last_cluster(text_before) {
            let whole: String = p.chars().nfc().collect();
            let low = whole.to_lowercase();
            if let Some(key) = self.unconvert.get(&low) {
                let text = if whole == low { key.clone() } else { key.to_uppercase() };
                return Step { edit: Self::replace_cluster(p, text), pending: vec![], chain_broken: None };
            }
        }
        Step { edit: Edit::Pass, pending: vec![], chain_broken: None }
    }

    pub fn handle_key(&self, text_before: &str, k: &Keystroke, pending: &Pending, chain_broken: bool) -> Step {
        let broken_in = chain_broken || k.shift_broke;
        let fin = |edit: Edit, pending: Pending| -> Step {
            let seg = match &edit {
                Edit::Replace { .. } => true,
                Edit::Insert { text } => !text.is_ascii(),
                _ => false,
            };
            Step { edit, pending, chain_broken: Some(if seg { false } else { broken_in }) }
        };
        let flush = || -> (Edit, Pending) {
            let text = self.commit_text(text_before, pending);
            if text.is_empty() { (Edit::Noop, vec![]) } else { (Edit::Insert { text }, vec![]) }
        };
        let with_flush = |edit: Edit| -> (Edit, Pending) {
            if pending.is_empty() {
                return (edit, vec![]);
            }
            let pre = self.commit_text(text_before, pending);
            if pre.is_empty() {
                return (edit, vec![]);
            }
            match edit {
                Edit::Insert { text } => (Edit::Insert { text: pre + &text }, vec![]),
                Edit::Pass => (Edit::Insert { text: pre + &native_char(k) }, vec![]),
                other => (other, vec![]),
            }
        };
        let key = k.key.as_str();
        if key == "Escape" && !k.control && !k.option {
            let (e, p) = if pending.is_empty() { (Edit::Pass, pending.clone()) } else { flush() };
            return fin(e, p);
        }
        if key.chars().count() != 1 {
            return fin(Edit::Pass, pending.clone());
        }
        let kc = key.chars().next().unwrap();
        if k.control {
            if k.shift && kc.is_ascii_alphabetic() {
                let (e, p) = with_flush(Edit::Insert { text: kc.to_ascii_uppercase().to_string() });
                return fin(e, p);
            }
            return fin(Edit::Pass, pending.clone());
        }
        if key == " " && !k.option && !pending.is_empty() {
            let (e, p) = flush();
            return if e == Edit::Noop { fin(Edit::Pass, vec![]) } else { fin(e, p) };
        }
        let caps = k.caps_lock && !k.option && kc.is_ascii_alphabetic();
        let o = if caps { Some(kc.to_ascii_uppercase().to_string()) } else { self.key_output(k) };
        let Some(o) = o else {
            let (e, p) = with_flush(Edit::Pass);
            return fin(e, p);
        };
        let on = Settings {
            capital_digraphs: self.capital_digraphs && !caps,
            capital_digit_digraphs: self.capital_digraphs && !caps && !broken_in,
        };
        let w = Self::last_clusters(text_before, 2);
        let mut start = w.clone();
        start.push_str(&self.to_markers(pending));
        let buf = self.compose(&start, k, &o, &on, broken_in || caps);
        let chars: Vec<char> = buf.chars().collect();
        let mut j = chars.len();
        while j > 0 && self.is_marker(chars[j - 1]) {
            j -= 1;
        }
        let raw: String = chars[..j].iter().collect();
        let cd: Vec<char> = self.resolve(&raw, "").chars().nfd().collect();
        let next = self.from_markers(&chars[j..].iter().collect::<String>());
        let wd: Vec<char> = w.chars().nfd().collect();
        let mut p = 0;
        while p < wd.len() && p < cd.len() && wd[p] == cd[p] {
            p += 1;
        }
        if p == wd.len() && p == cd.len() {
            return fin(Edit::Noop, next);
        }
        let orig: Vec<char> = w.chars().collect();
        let (mut b, mut pd) = (0usize, 0usize);
        for c in &orig {
            let n = c.to_string().chars().nfd().count();
            if pd + n > p {
                break;
            }
            pd += n;
            b += 1;
        }
        while b > 0 && pd < cd.len() && is_combining_mark(cd[pd]) {
            b -= 1;
            pd -= orig[b].to_string().chars().nfd().count();
            if !is_combining_mark(orig[b]) {
                break;
            }
        }
        let text: String = cd[pd..].iter().collect::<String>().chars().nfc().collect();
        let length = orig.len() - b;
        if length == 0 {
            if pending.is_empty() && text == native_char(k) {
                return fin(Edit::Pass, next);
            }
            return fin(Edit::Insert { text }, next);
        }
        fin(Edit::Replace { length, text }, next)
    }
}

// ----------------------------------------------------------- free fns

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
        return String::new();
    }
    kc.to_string()
}

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

pub fn last_cluster_byte_len(text_before: &str) -> usize {
    Engine::last_cluster(text_before).map(str::len).unwrap_or(0)
}
