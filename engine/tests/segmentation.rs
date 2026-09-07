// The engine's cluster boundary must be real UAX #29 grapheme segmentation,
// the same answer Intl.Segmenter gives index.ts — the shells use it to
// decide how many bytes a backspace removes, so a divergence deletes half
// an emoji. These cases are exactly the ones a combining-mark scan gets
// wrong. The parity vectors can never cover this: they are recorded from
// tests that only type IPA.

use ipabet_engine::last_cluster_byte_len;

#[test]
fn a_skin_tone_stays_attached_to_its_emoji() {
    let text = "abc\u{1F44D}\u{1F3FD}"; // 👍🏽
    assert_eq!(last_cluster_byte_len(text), "\u{1F44D}\u{1F3FD}".len());
}

#[test]
fn a_zwj_family_is_one_cluster() {
    let family = "\u{1F469}\u{200D}\u{1F469}\u{200D}\u{1F467}"; // 👩‍👩‍👧
    let text = format!("x{family}");
    assert_eq!(last_cluster_byte_len(&text), family.len());
}

#[test]
fn a_flag_is_one_cluster() {
    let flag = "\u{1F1FA}\u{1F1F8}"; // 🇺🇸
    let text = format!("go {flag}");
    assert_eq!(last_cluster_byte_len(&text), flag.len());
}

#[test]
fn decomposed_hangul_is_one_cluster() {
    let han = "\u{1112}\u{1161}\u{11AB}"; // 한, NFD
    let text = format!("a{han}");
    assert_eq!(last_cluster_byte_len(&text), han.len());
}

#[test]
fn ipa_base_plus_marks_still_reads_as_before() {
    let text = "\u{0259}\u{0303}\u{0301}"; // ə + nasal + acute
    assert_eq!(last_cluster_byte_len(text), text.len());
}

#[test]
fn empty_text_has_no_cluster() {
    assert_eq!(last_cluster_byte_len(""), 0);
}
