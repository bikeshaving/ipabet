// The subset of spec/ipabet.json's shape the engine actually reads. serde
// handles the parsing generically.

use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct Spec {
    pub letters: Vec<LetterEntry>,
    pub marks: Vec<MarkEntry>,
    pub superscripts: SupSubTable,
    pub subscripts: SupSubTable,
    #[serde(rename = "optShift", default)]
    pub opt_shift: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct LetterEntry {
    pub key: String,
    pub glyph: String,
}

#[derive(Deserialize)]
pub struct MarkEntry {
    pub opt: String,
    pub mark: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub double: Option<String>,
    #[serde(rename = "doubleSpacing", default)]
    pub double_spacing: bool,
    #[serde(default)]
    pub cycle: Vec<String>,
    #[serde(rename = "doubleCycle", default)]
    pub double_cycle: Vec<String>,
    pub clone: Option<String>,
    #[serde(rename = "doubleClone")]
    pub double_clone: Option<String>,
    #[serde(default)]
    pub exclusive: bool,
}

#[derive(Deserialize)]
pub struct SupSubTable {
    pub table: Vec<SupSubEntry>,
}

#[derive(Deserialize)]
pub struct SupSubEntry {
    pub base: String,
    pub sup: Option<String>,
    pub sub: Option<String>,
}

use roxmltree::{Document, Node};
use std::collections::HashSet;

/// Build a Spec from the LDML source (spec/ipabet.xml). This is the Rust port of
/// spec/tools/ldml-to-spec.ts, proven to reconstruct this Spec so the engine
/// passes its full parity + fuzz suite from the LDML alone.
pub fn parse_ldml(xml: &str) -> Result<Spec, String> {
    let doc = Document::parse(xml).map_err(|e| e.to_string())?;
    let all = |t: &'static str| -> Vec<Node> {
        doc.descendants().filter(|n| n.tag_name().name() == t).collect()
    };

    let mut keys: HashMap<String, String> = HashMap::new();
    for n in all("key") {
        if let Some(id) = n.attribute("id") {
            keys.insert(id.to_string(), n.attribute("output").unwrap_or("").to_string());
        }
    }
    let mut layers: HashMap<String, Vec<Vec<String>>> = HashMap::new();
    for layer in all("layer") {
        let mods = layer.attribute("modifiers").unwrap_or("none").to_string();
        let rows: Vec<Vec<String>> = layer
            .children()
            .filter(|r| r.tag_name().name() == "row")
            .map(|r| r.attribute("keys").unwrap_or("").split_whitespace().map(String::from).collect())
            .collect();
        layers.insert(mods, rows);
    }
    let transforms: Vec<(String, String)> = all("transform")
        .iter()
        .filter_map(|n| Some((n.attribute("from")?.to_string(), n.attribute("to")?.to_string())))
        .collect();
    let mut disp: HashMap<String, String> = HashMap::new();
    for n in all("display") {
        if let (Some(out), Some(d)) = (n.attribute("output"), n.attribute("display")) {
            if let Some(name) = out.strip_prefix("\\m{").and_then(|s| s.strip_suffix('}')) {
                disp.insert(name.to_string(), d.to_string());
            }
        }
    }
    // marker name -> combining char, from each dead-key rule \m{NAME}(.) -> $1\u{XXXX}
    let mut marker_char: HashMap<String, char> = HashMap::new();
    for (f, t) in &transforms {
        if let (Some(name), Some(hx)) = (
            f.strip_prefix("\\m{").and_then(|s| s.strip_suffix("}(.)")),
            t.strip_prefix("$1\\u{").and_then(|s| s.strip_suffix('}')),
        ) {
            if let Some(ch) = u32::from_str_radix(hx, 16).ok().and_then(char::from_u32) {
                marker_char.insert(name.to_string(), ch);
            }
        }
    }

    // letters: 26 single (b_a..b_z) + digraphs (base(\p{M}*)op)
    let mut letters = Vec::new();
    for c in b'a'..=b'z' {
        if let Some(g) = keys.get(&format!("b_{}", c as char)) {
            letters.push(LetterEntry { key: (c as char).to_string(), glyph: g.clone() });
        }
    }
    const PM: &str = "(\\p{M}*)";
    for (f, t) in &transforms {
        if let Some(idx) = f.find(PM) {
            let base = &f[..idx];
            if base.len() == 1 && base.as_bytes()[0].is_ascii_alphanumeric() {
                letters.push(LetterEntry {
                    key: format!("{base}{}", &f[idx + PM.len()..]),
                    glyph: t.strip_suffix("$1").unwrap_or(t).to_string(),
                });
            }
        }
    }

    // marks from the option layers + dead keys + displays + special
    const ROWS: [&str; 4] = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];
    let grid = |layer: &str| -> HashMap<char, String> {
        let mut out = HashMap::new();
        if let Some(rws) = layers.get(layer) {
            for (ri, ids) in rws.iter().enumerate() {
                for (ci, id) in ids.iter().enumerate() {
                    if let Some(ch) = ROWS[ri].chars().nth(ci) {
                        out.insert(ch, id.clone());
                    }
                }
            }
        }
        out
    };
    let alt_r = grid("altR");
    let alt_rs = grid("altR shift");
    let char_of = |id: &str| -> Option<char> {
        if let Some(name) = id.strip_prefix("mk_") {
            marker_char.get(name).copied()
        } else if id.starts_with("sp_") {
            keys.get(id).and_then(|s| s.chars().next())
        } else {
            None
        }
    };
    // Cycles come from chain transforms \m{P}\m{key} -> \m{R} (R != key):
    // repeated presses of `key` walk a family. Follow each key's chain from the
    // key itself. (two_markers / one_marker are defined just below.)
    let mut cyc: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut edge: HashMap<(String, String), String> = HashMap::new();
        let mut keys2: Vec<String> = Vec::new();
        for (f, t) in &transforms {
            if let (Some((p, q)), Some(r)) = (two_markers(f), one_marker(t)) {
                if r != q {
                    edge.insert((p.to_string(), q.to_string()), r.to_string());
                    if !keys2.iter().any(|k| k == q) {
                        keys2.push(q.to_string());
                    }
                }
            }
        }
        for key in &keys2 {
            let mut family = vec![key.clone()];
            let mut cur = key.clone();
            while let Some(r) = edge.get(&(cur.clone(), key.clone())) {
                if r == key {
                    break;
                }
                family.push(r.clone());
                cur = r.clone();
            }
            cyc.insert(key.clone(), family);
        }
    }
    // Exclusive pairs come from marker-collapse transforms: \m{A}\m{B} -> \m{B}
    // means the primary A and its double B are one dimension, so B replaces A.
    fn two_markers(s: &str) -> Option<(&str, &str)> {
        let r = s.strip_prefix("\\m{")?;
        let e = r.find('}')?;
        let after = r[e + 1..].strip_prefix("\\m{")?;
        let e2 = after.find('}')?;
        if !after[e2 + 1..].is_empty() {
            return None;
        }
        Some((&r[..e], &after[..e2]))
    }
    fn one_marker(s: &str) -> Option<&str> {
        let r = s.strip_prefix("\\m{")?;
        let e = r.find('}')?;
        if !r[e + 1..].is_empty() {
            return None;
        }
        Some(&r[..e])
    }
    let mut excl_edges: HashSet<(String, String)> = HashSet::new();
    for (f, t) in &transforms {
        if let (Some((a, b)), Some(c)) = (two_markers(f), one_marker(t)) {
            if c == b {
                excl_edges.insert((a.to_string(), b.to_string()));
            }
        }
    }
    let fam_chars = |name: &str| -> Vec<String> {
        cyc.get(name)
            .map(|fam| fam.iter().skip(1).filter_map(|n| marker_char.get(n)).map(|c| c.to_string()).collect())
            .unwrap_or_default()
    };

    let mut marks = Vec::new();
    for (phys, id) in &alt_r {
        if !(id.starts_with("mk_") || id.starts_with("sp_")) {
            continue;
        }
        let name = &id[3..];
        let combining = id.starts_with("mk_");
        let mark = match char_of(id) {
            Some(c) => c.to_string(),
            None => continue,
        };
        let mut e = MarkEntry {
            opt: phys.to_string(),
            mark,
            kind: if combining { "combining" } else { "spacing" }.to_string(),
            double: None,
            double_spacing: false,
            cycle: Vec::new(),
            double_cycle: Vec::new(),
            clone: None,
            double_clone: None,
            exclusive: false,
        };
        let mut double_name: Option<String> = None;
        if let Some(did) = alt_rs.get(phys) {
            if did.starts_with("mk_") || did.starts_with("sp_") {
                e.double = char_of(did).map(|c| c.to_string());
                if did.starts_with("sp_") {
                    e.double_spacing = true;
                }
                if did.starts_with("mk_") {
                    double_name = Some(did[3..].to_string());
                    if let Some(d) = disp.get(&did[3..]) {
                        e.double_clone = Some(d.clone());
                    }
                }
                e.double_cycle = fam_chars(&did[3..]);
            }
        }
        if combining {
            if let Some(d) = disp.get(name) {
                e.clone = Some(d.clone());
            }
        }
        e.cycle = fam_chars(name);
        if let Some(dn) = &double_name {
            if excl_edges.contains(&(name.to_string(), dn.clone())) {
                e.exclusive = true;
            }
        }
        marks.push(e);
    }

    // Each \m{raise}<base> -> <sup> (and \m{lower}<base> -> <sub>) transform is
    // one table row; the base carries a regex escape (\( \+) that we strip off.
    let table = |marker: &str, sup: bool| -> SupSubTable {
        let pfx = format!("\\m{{{marker}}}");
        SupSubTable {
            table: transforms
                .iter()
                .filter_map(|(f, t)| {
                    let base = f.strip_prefix(&pfx)?;
                    let base = base.strip_prefix('\\').unwrap_or(base);
                    Some(SupSubEntry {
                        base: base.to_string(),
                        sup: if sup { Some(t.clone()) } else { None },
                        sub: if sup { None } else { Some(t.clone()) },
                    })
                })
                .collect(),
        }
    };
    let superscripts = table("raise", true);
    let subscripts = table("lower", false);

    let mut opt_shift: HashMap<String, String> = HashMap::new();
    for (id, out) in &keys {
        if let Some(d) = id.strip_prefix("os_") {
            if d.len() == 1 && d.as_bytes()[0].is_ascii_digit() {
                opt_shift.insert(d.to_string(), out.clone());
            }
        }
    }

    Ok(Spec { letters, marks, superscripts, subscripts, opt_shift })
}
