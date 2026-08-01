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
    pub quotes: Quotes,
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

#[derive(Deserialize)]
pub struct Quotes {
    pub default: String,
    pub locales: HashMap<String, Vec<String>>,
}
