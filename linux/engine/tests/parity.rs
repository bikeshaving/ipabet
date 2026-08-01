// Replays spec/parity-vectors.json through the Rust engine directly. Mirrors
// js/src/index.ts's typeKeys() loop exactly (including its "⌫"
// backspace-sentinel handling and the still-pending-commits-as-spacing-form
// tail), since the vectors were recorded through that exact function.

use ipabet_engine::{apply_edit, native_char, Edit, Engine, Keystroke, Pending};
use serde::Deserialize;

#[derive(Deserialize)]
struct RawKeystroke {
    key: String,
    #[serde(default)]
    shift: bool,
    #[serde(default)]
    option: bool,
    #[serde(rename = "shiftBroke", default)]
    shift_broke: bool,
    #[serde(rename = "capsLock", default)]
    caps_lock: bool,
    #[serde(default)]
    control: bool,
}

impl From<RawKeystroke> for Keystroke {
    fn from(r: RawKeystroke) -> Self {
        Keystroke {
            key: r.key,
            shift: r.shift,
            option: r.option,
            shift_broke: r.shift_broke,
            caps_lock: r.caps_lock,
            control: r.control,
        }
    }
}

#[derive(Deserialize)]
struct Vector {
    keys: Vec<RawKeystroke>,
    initial: String,
    expected: String,
    locale: String,
    capital_digraphs: bool,
}

fn replay(engine: &Engine, keys: Vec<RawKeystroke>, initial: &str) -> String {
    let mut text = initial.to_string();
    let mut pending: Pending = vec![];
    let mut chain_broken = false;
    for raw in keys {
        let k: Keystroke = raw.into();
        let is_backspace = k.key == "⌫";
        let step = if is_backspace {
            if k.control {
                engine.handle_unconvert(&text, &pending)
            } else {
                engine.handle_backspace(&text, &pending)
            }
        } else {
            engine.handle_key(&text, &k, &pending, chain_broken)
        };
        pending = step.pending;
        chain_broken = step.chain_broken.unwrap_or(false);
        if is_backspace && step.edit == Edit::Pass {
            if !k.control {
                let len = ipabet_engine::last_cluster_byte_len(&text);
                text.truncate(text.len() - len);
            }
        } else {
            let native = if step.edit == Edit::Pass { native_char(&k) } else { String::new() };
            text = apply_edit(&text, &step.edit, &native);
        }
    }
    if !pending.is_empty() {
        text.push_str(&engine.commit_string(&pending));
    }
    text
}

#[test]
fn parity_vectors() {
    let spec_json = std::fs::read_to_string(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/ipabet.json"),
    )
    .expect("read spec/ipabet.json");
    let mut engine = Engine::new(&spec_json).expect("parse spec");

    let vectors_json = std::fs::read_to_string(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../spec/parity-vectors.json"),
    )
    .expect("read spec/parity-vectors.json");
    let vectors: Vec<Vector> = serde_json::from_str(&vectors_json).expect("parse vectors");

    let mut pass = 0;
    let mut failures = Vec::new();
    for (i, v) in vectors.into_iter().enumerate() {
        engine.set_quote_locale(&v.locale);
        engine.set_capital_digraphs(v.capital_digraphs);
        let keys_desc: Vec<String> = v
            .keys
            .iter()
            .map(|k| format!("{}{}{}{}", k.key, if k.shift { "+shift" } else { "" }, if k.option { "+opt" } else { "" }, if k.control { "+ctrl" } else { "" }))
            .collect();
        let got = replay(&engine, v.keys, &v.initial);
        if got == v.expected {
            pass += 1;
        } else {
            failures.push(format!(
                "#{i}: got [{got}] want [{}] locale={} initial=[{}] keys={:?}",
                v.expected, v.locale, v.initial, keys_desc
            ));
        }
    }

    if !failures.is_empty() {
        for f in failures.iter().take(40) {
            eprintln!("FAIL {f}");
        }
    }
    eprintln!("\n{pass} pass, {} fail, {} total", failures.len(), pass + failures.len());
    assert!(failures.is_empty(), "{} of {} vectors failed", failures.len(), pass + failures.len());
}
