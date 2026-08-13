// The C ABI, exercised as C calls it.
//
// tests/parity.rs replays the vectors through the Rust API, which is not what
// any shipped port uses: the IBus engine, the fcitx5 addon and the Windows text
// service all go through ffi.rs. Everything between those two — the fixed
// buffers, the pending array, the null handling — was untested until this file.
//
// A panic here is undefined behaviour in a real caller, so the arguments are
// the hostile ones: null pointers, counts that exceed their array, buffers too
// small for what goes in them.

use ipabet_engine::ffi::*;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

fn spec() -> CString {
    CString::new(include_str!("../../spec/ipabet.json")).unwrap()
}

fn engine() -> *mut ipabet_engine::Engine {
    let e = unsafe { ipabet_engine_new(spec().as_ptr()) };
    assert!(!e.is_null(), "the shipped spec must parse");
    e
}

fn key(k: &str) -> CString {
    CString::new(k).unwrap()
}

fn stroke(k: &CString, option: bool, shift: bool) -> CKeystroke {
    CKeystroke {
        key: k.as_ptr(),
        shift,
        option,
        shift_broke: false,
        caps_lock: false,
        control: false,
    }
}

fn text_of(edit: &CEdit) -> String {
    unsafe { CStr::from_ptr(edit.text.as_ptr()) }
        .to_string_lossy()
        .into_owned()
}

fn empty_pending() -> CPending {
    CPending { items: [0; PENDING_MAX as usize], count: 0 }
}

#[test]
fn a_digraph_comes_back_as_a_replacement() {
    let e = engine();
    let before = CString::new("t").unwrap();
    let h = key("h");
    let step = unsafe {
        ipabet_engine_handle_key(e, before.as_ptr(), stroke(&h, false, true), empty_pending(), false)
    };
    assert!(step.edit.edit_type == CEditType::Replace);
    assert_eq!(text_of(&step.edit), "θ");
    assert_eq!(step.edit.replace_length, 1);
    unsafe { ipabet_engine_free(e) };
}

#[test]
fn an_armed_mark_crosses_the_boundary_and_comes_back() {
    let e = engine();
    let before = CString::new("").unwrap();
    let n = key("n");
    let armed = unsafe {
        ipabet_engine_handle_key(e, before.as_ptr(), stroke(&n, true, false), empty_pending(), false)
    };
    assert_eq!(armed.pending.count, 1, "the tilde is pending");

    // The preview is what the three shells show while the mark waits.
    let mut buf = [0 as c_char; 64];
    unsafe { ipabet_preview_string(e, armed.pending, buf.as_mut_ptr(), buf.len()) };
    assert_eq!(unsafe { CStr::from_ptr(buf.as_ptr()) }.to_str().unwrap(), "˜");

    let a = key("a");
    let landed = unsafe {
        ipabet_engine_handle_key(e, before.as_ptr(), stroke(&a, false, false), armed.pending, false)
    };
    assert_eq!(text_of(&landed.edit), "ã");
    assert_eq!(landed.pending.count, 0, "the mark is spent");
    unsafe { ipabet_engine_free(e) };
}

#[test]
fn a_pending_count_past_the_array_is_clamped_not_indexed() {
    let e = engine();
    let before = CString::new("").unwrap();
    // What a caller with a stale or corrupt struct hands over. Indexing with
    // this would panic across the boundary, which is undefined behaviour.
    let hostile = CPending { items: [0x303; PENDING_MAX as usize], count: i32::MAX };
    let a = key("a");
    let step = unsafe {
        ipabet_engine_handle_key(e, before.as_ptr(), stroke(&a, false, false), hostile, false)
    };
    assert!(step.pending.count <= PENDING_MAX as i32);

    let negative = CPending { items: [0; PENDING_MAX as usize], count: -5 };
    let mut buf = [0 as c_char; 64];
    unsafe { ipabet_preview_string(e, negative, buf.as_mut_ptr(), buf.len()) };
    assert_eq!(unsafe { CStr::from_ptr(buf.as_ptr()) }.to_str().unwrap(), "");
    unsafe { ipabet_engine_free(e) };
}

#[test]
fn a_null_engine_answers_rather_than_dereferencing() {
    let before = CString::new("t").unwrap();
    let h = key("h");
    let step = unsafe {
        ipabet_engine_handle_key(
            std::ptr::null(),
            before.as_ptr(),
            stroke(&h, false, true),
            empty_pending(),
            false,
        )
    };
    assert!(step.edit.edit_type == CEditType::Noop);

    let back = unsafe {
        ipabet_engine_handle_backspace(std::ptr::null(), before.as_ptr(), empty_pending())
    };
    assert!(back.edit.edit_type == CEditType::Noop);

    // And a null spec is a packaging fault, not a crash.
    assert!(unsafe { ipabet_engine_new(std::ptr::null()) }.is_null());
    unsafe { ipabet_engine_set_capital_digraphs(std::ptr::null_mut(), true) };
}

#[test]
fn a_null_text_reads_as_an_empty_document() {
    let e = engine();
    let h = key("h");
    // No lookback, so ⇧H has nothing to transform and types its own letter.
    let step = unsafe {
        ipabet_engine_handle_key(e, std::ptr::null(), stroke(&h, false, true), empty_pending(), false)
    };
    assert!(step.edit.edit_type != CEditType::Replace);
    assert_eq!(unsafe { ipabet_last_cluster_byte_len(std::ptr::null()) }, 0);
    unsafe { ipabet_engine_free(e) };
}

#[test]
fn a_buffer_too_small_truncates_between_codepoints() {
    let e = engine();
    let before = CString::new("").unwrap();

    // Two stacked marks, which is four bytes of preview, then buffers that
    // cannot hold them. Both marks are prefix and on independent dimensions,
    // so they stack rather than replace each other.
    let mut pending = empty_pending();
    for k in ["n", "e"] {
        let k = key(k);
        let step = unsafe {
            ipabet_engine_handle_key(e, before.as_ptr(), stroke(&k, true, false), pending, false)
        };
        pending = step.pending;
    }
    assert_eq!(pending.count, 2, "the two marks stack");

    for cap in 1..8usize {
        let mut buf = [0x7f as c_char; 16];
        unsafe { ipabet_preview_string(e, pending, buf.as_mut_ptr(), cap) };
        let bytes = unsafe { CStr::from_ptr(buf.as_ptr()) }.to_bytes();
        assert!(bytes.len() < cap, "cap {cap} must leave room for the NUL");
        std::str::from_utf8(bytes)
            .unwrap_or_else(|_| panic!("cap {cap} split a codepoint and produced invalid UTF-8"));
        // Nothing past the cap was touched.
        assert_eq!(buf[cap], 0x7f as c_char, "cap {cap} wrote past its buffer");
    }
    unsafe { ipabet_engine_free(e) };
}

#[test]
fn a_deep_stack_of_marks_survives_the_round_trip() {
    // The engine stacks marks for as long as the user presses them, and the
    // pending array is fixed. A stack that overflows it is truncated on the way
    // out — which loses marks on Windows and Linux and keeps them on macOS,
    // where nothing crosses this boundary.
    let e = engine();
    let before = CString::new("").unwrap();
    let marks = ["n", "e", "w", "h", "v", "b", "k", "t", "m", "g", "f", "d"];

    let mut pending = empty_pending();
    for m in marks {
        let k = key(m);
        let step = unsafe {
            ipabet_engine_handle_key(e, before.as_ptr(), stroke(&k, true, false), pending, false)
        };
        pending = step.pending;
    }
    assert_eq!(
        pending.count as usize,
        marks.len(),
        "every armed mark has to fit: the array is what the ports carry"
    );

    // And what lands is exactly what the Rust API produces for the same input.
    // Marks fuse, so counting codepoints proves nothing; agreeing with the
    // engine that macOS uses is the invariant that matters.
    let a = key("a");
    let landed = unsafe {
        ipabet_engine_handle_key(e, before.as_ptr(), stroke(&a, false, false), pending, false)
    };
    assert_eq!(landed.pending.count, 0);

    let native = ipabet_engine::Engine::new(spec().to_str().unwrap()).unwrap();
    let mut native_pending: ipabet_engine::Pending = Vec::new();
    for m in marks {
        let k = ipabet_engine::Keystroke {
            key: m.to_string(),
            option: true,
            ..Default::default()
        };
        native_pending = native.handle_key("", &k, &native_pending, false).pending;
    }
    let base = ipabet_engine::Keystroke { key: "a".into(), ..Default::default() };
    let expected = match native.handle_key("", &base, &native_pending, false).edit {
        ipabet_engine::Edit::Insert { text } | ipabet_engine::Edit::Replace { text, .. } => text,
        other => panic!("the engine answered {other:?}"),
    };
    assert_eq!(text_of(&landed.edit), expected, "the boundary dropped marks");
    unsafe { ipabet_engine_free(e) };
}

#[test]
fn a_zero_capacity_buffer_is_left_alone() {
    let e = engine();
    let mut buf = [0x7f as c_char; 4];
    unsafe { ipabet_preview_string(e, empty_pending(), buf.as_mut_ptr(), 0) };
    assert_eq!(buf[0], 0x7f as c_char);
    unsafe { ipabet_commit_string(e, empty_pending(), std::ptr::null_mut(), 8) };
    unsafe { ipabet_engine_free(e) };
}

#[test]
fn an_edit_whose_text_fills_its_array_is_read_to_the_end_and_no_further() {
    // A caller-built CEdit with no room for a terminator. Reading it as a C
    // string would run past the struct.
    let edit = CEdit {
        edit_type: CEditType::Insert,
        text: [0x61 as c_char; EDIT_TEXT_MAX as usize],
        replace_length: 0,
    };
    let before = CString::new("").unwrap();
    let native = CString::new("").unwrap();
    let mut out = [0 as c_char; 256];
    unsafe {
        ipabet_apply_edit(
            before.as_ptr(),
            &edit,
            native.as_ptr(),
            out.as_mut_ptr(),
            out.len(),
        )
    };
    let got = unsafe { CStr::from_ptr(out.as_ptr()) }.to_string_lossy();
    assert_eq!(got.len(), EDIT_TEXT_MAX as usize);

    unsafe {
        ipabet_apply_edit(before.as_ptr(), std::ptr::null(), native.as_ptr(), out.as_mut_ptr(), out.len())
    };
}

#[test]
fn the_key_pointer_may_be_null() {
    let e = engine();
    let before = CString::new("").unwrap();
    let k = CKeystroke {
        key: std::ptr::null(),
        shift: false,
        option: false,
        shift_broke: false,
        caps_lock: false,
        control: false,
    };
    let step = unsafe { ipabet_engine_handle_key(e, before.as_ptr(), k, empty_pending(), false) };
    assert!(step.edit.edit_type != CEditType::Replace);

    let mut buf = [0 as c_char; 16];
    let k = CKeystroke {
        key: std::ptr::null(),
        shift: false,
        option: false,
        shift_broke: false,
        caps_lock: false,
        control: false,
    };
    unsafe { ipabet_native_char(k, buf.as_mut_ptr(), buf.len()) };
    unsafe { ipabet_engine_free(e) };
}
