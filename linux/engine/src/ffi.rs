// The C ABI the fcitx5 addon (L1, C++) links against, generated into a header
// by cbindgen (see build.rs). Every type here is a plain repr(C) value —
// fixed-size buffers, not owned/allocated strings — so the caller never has
// to free anything the Rust side handed back. Pending/Edit mirror the same
// representation the (now-deleted) C port used: pending items are codepoints
// with two reserved negative sentinels for the Raise/Lower operators, since
// real codepoints are never negative.

use crate::{apply_edit as rust_apply_edit, last_cluster_byte_len, native_char as rust_native_char};
use crate::{Edit, Engine, Keystroke, Pending, PendingItem};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

// pub: cbindgen needs these to emit #defines for the array sizes below.
pub const PENDING_MAX: usize = 8;
pub const EDIT_TEXT_MAX: usize = 64; // bytes; a glyph plus a few marks in UTF-8 never gets close

/// Never a real codepoint (always >= 0): the pending "raise" operator.
pub const PENDING_RAISE: i32 = -1;
/// Never a real codepoint: the pending "lower" operator.
pub const PENDING_LOWER: i32 = -2;

#[repr(C)]
pub struct CPending {
    pub items: [i32; PENDING_MAX],
    pub count: i32,
}

#[repr(C)]
#[derive(PartialEq)]
pub enum CEditType {
    Insert = 0,
    Replace = 1,
    Pass = 2,
    Noop = 3,
}

#[repr(C)]
pub struct CEdit {
    pub edit_type: CEditType,
    /// UTF-8, NUL-terminated. Truncated (never split mid-codepoint) if a
    /// result somehow exceeded EDIT_TEXT_MAX — never happens in practice; a
    /// base plus its stacked marks is at most a handful of codepoints.
    pub text: [c_char; EDIT_TEXT_MAX],
    /// Codepoints to remove from the end of text_before (Replace only).
    pub replace_length: i32,
}

#[repr(C)]
pub struct CStep {
    pub edit: CEdit,
    pub pending: CPending,
    pub chain_broken: bool,
    pub has_chain_broken: bool,
}

#[repr(C)]
pub struct CKeystroke {
    /// NUL-terminated UTF-8 — "a", "5", ";", "Escape", "⌫" …
    pub key: *const c_char,
    pub shift: bool,
    pub option: bool,
    pub shift_broke: bool,
    pub caps_lock: bool,
    pub control: bool,
}

fn pending_from_c(p: &CPending) -> Pending {
    (0..p.count.max(0) as usize)
        .map(|i| match p.items[i] {
            PENDING_RAISE => PendingItem::Raise,
            PENDING_LOWER => PendingItem::Lower,
            cp => PendingItem::Mark(char::from_u32(cp as u32).unwrap_or('\u{FFFD}')),
        })
        .collect()
}

fn pending_to_c(p: &Pending) -> CPending {
    let mut items = [0i32; PENDING_MAX];
    let count = p.len().min(PENDING_MAX);
    for (i, item) in p.iter().take(count).enumerate() {
        items[i] = match item {
            PendingItem::Raise => PENDING_RAISE,
            PendingItem::Lower => PENDING_LOWER,
            PendingItem::Mark(c) => *c as i32,
        };
    }
    CPending { items, count: count as i32 }
}

fn str_into_buf(s: &str, buf: &mut [c_char; EDIT_TEXT_MAX]) {
    let bytes = s.as_bytes();
    let mut n = bytes.len().min(EDIT_TEXT_MAX - 1);
    // Only back up over continuation bytes if we actually truncated —
    // `bytes[n]` is one-past-the-end and out of bounds otherwise, which is
    // the common case (a base plus its marks is always far under the cap).
    if n < bytes.len() {
        while n > 0 && (bytes[n] & 0xC0) == 0x80 {
            n -= 1;
        }
    }
    for (i, &b) in bytes[..n].iter().enumerate() {
        buf[i] = b as c_char;
    }
    buf[n] = 0;
}

fn edit_to_c(e: &Edit) -> CEdit {
    let mut text = [0 as c_char; EDIT_TEXT_MAX];
    let (edit_type, replace_length) = match e {
        Edit::Insert { text: t } => {
            str_into_buf(t, &mut text);
            (CEditType::Insert, 0)
        }
        Edit::Replace { length, text: t } => {
            str_into_buf(t, &mut text);
            (CEditType::Replace, *length as i32)
        }
        Edit::Pass => (CEditType::Pass, 0),
        Edit::Noop => (CEditType::Noop, 0),
    };
    CEdit { edit_type, text, replace_length }
}

/// # Safety
/// `key.key` must be a valid NUL-terminated UTF-8 C string for the duration
/// of this call.
unsafe fn keystroke_from_c(k: &CKeystroke) -> Keystroke {
    let key = if k.key.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(k.key) }.to_string_lossy().into_owned()
    };
    Keystroke { key, shift: k.shift, option: k.option, shift_broke: k.shift_broke, caps_lock: k.caps_lock, control: k.control }
}

/// # Safety
/// `spec_json` must be a valid NUL-terminated UTF-8 C string. Returns null on
/// a parse error — a build/packaging bug (a malformed spec.json shipped),
/// not a runtime condition the caller recovers from.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_engine_new(spec_json: *const c_char) -> *mut Engine {
    unsafe {
        let json = match CStr::from_ptr(spec_json).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        };
        match Engine::new(json) {
            Ok(engine) => Box::into_raw(Box::new(engine)),
            Err(_) => std::ptr::null_mut(),
        }
    }
}

/// # Safety
/// `engine` must be a pointer previously returned by `ipabet_engine_new` and
/// not already freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_engine_free(engine: *mut Engine) {
    unsafe {
        if !engine.is_null() {
            drop(Box::from_raw(engine));
        }
    }
}

/// # Safety
/// `engine` must be a live pointer from `ipabet_engine_new`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_engine_set_capital_digraphs(engine: *mut Engine, on: bool) {
    unsafe { (*engine).set_capital_digraphs(on) };
}

/// # Safety
/// `engine` must be live; `locale` must be a valid NUL-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_engine_set_quote_locale(engine: *mut Engine, locale: *const c_char) {
    unsafe {
        let locale = CStr::from_ptr(locale).to_string_lossy();
        (*engine).set_quote_locale(&locale);
    }
}

/// # Safety
/// `engine` must be live; `text_before` a valid NUL-terminated UTF-8 C string;
/// `keystroke.key` a valid NUL-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_engine_handle_key(
    engine: *const Engine,
    text_before: *const c_char,
    keystroke: CKeystroke,
    pending: CPending,
    chain_broken: bool,
) -> CStep {
    unsafe {
        let text = CStr::from_ptr(text_before).to_string_lossy();
        let k = keystroke_from_c(&keystroke);
        let p = pending_from_c(&pending);
        let step = (*engine).handle_key(&text, &k, &p, chain_broken);
        CStep {
            edit: edit_to_c(&step.edit),
            pending: pending_to_c(&step.pending),
            chain_broken: step.chain_broken.unwrap_or(false),
            has_chain_broken: step.chain_broken.is_some(),
        }
    }
}

/// # Safety
/// `engine` must be live; `text_before` a valid NUL-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_engine_handle_backspace(
    engine: *const Engine,
    text_before: *const c_char,
    pending: CPending,
) -> CStep {
    unsafe {
        let text = CStr::from_ptr(text_before).to_string_lossy();
        let p = pending_from_c(&pending);
        let step = (*engine).handle_backspace(&text, &p);
        CStep {
            edit: edit_to_c(&step.edit),
            pending: pending_to_c(&step.pending),
            chain_broken: false,
            has_chain_broken: false,
        }
    }
}

/// # Safety
/// `engine` must be live; `text_before` a valid NUL-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_engine_handle_unconvert(
    engine: *const Engine,
    text_before: *const c_char,
    pending: CPending,
) -> CStep {
    unsafe {
        let text = CStr::from_ptr(text_before).to_string_lossy();
        let p = pending_from_c(&pending);
        let step = (*engine).handle_unconvert(&text, &p);
        CStep {
            edit: edit_to_c(&step.edit),
            pending: pending_to_c(&step.pending),
            chain_broken: false,
            has_chain_broken: false,
        }
    }
}

/// # Safety
/// `engine` must be live. `out` must point to at least `out_cap` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_preview_string(engine: *const Engine, pending: CPending, out: *mut c_char, out_cap: usize) {
    unsafe {
        let p = pending_from_c(&pending);
        let s = (*engine).preview_string(&p);
        write_c_string(&s, out, out_cap);
    }
}

/// # Safety
/// `engine` must be live. `out` must point to at least `out_cap` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_commit_string(engine: *const Engine, pending: CPending, out: *mut c_char, out_cap: usize) {
    unsafe {
        let p = pending_from_c(&pending);
        let s = (*engine).commit_string(&p);
        write_c_string(&s, out, out_cap);
    }
}

/// # Safety
/// `keystroke.key` must be a valid NUL-terminated UTF-8 C string. `out` must
/// point to at least `out_cap` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_native_char(keystroke: CKeystroke, out: *mut c_char, out_cap: usize) {
    unsafe {
        let k = keystroke_from_c(&keystroke);
        let s = rust_native_char(&k);
        write_c_string(&s, out, out_cap);
    }
}

/// # Safety
/// `text_before` and `native` must be valid NUL-terminated UTF-8 C strings.
/// `out` must point to at least `out_cap` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_apply_edit(
    text_before: *const c_char,
    edit: *const CEdit,
    native: *const c_char,
    out: *mut c_char,
    out_cap: usize,
) {
    unsafe {
        let text = CStr::from_ptr(text_before).to_string_lossy();
        let native = CStr::from_ptr(native).to_string_lossy();
        let e = &*edit;
        let text_str = CStr::from_ptr(e.text.as_ptr()).to_string_lossy();
        let edit = match e.edit_type {
            CEditType::Insert => Edit::Insert { text: text_str.into_owned() },
            CEditType::Replace => Edit::Replace { length: e.replace_length as usize, text: text_str.into_owned() },
            CEditType::Pass => Edit::Pass,
            CEditType::Noop => Edit::Noop,
        };
        let result = rust_apply_edit(&text, &edit, &native);
        write_c_string(&result, out, out_cap);
    }
}

/// # Safety
/// `text_before` must be a valid NUL-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ipabet_last_cluster_byte_len(text_before: *const c_char) -> usize {
    unsafe {
        let text = CStr::from_ptr(text_before).to_string_lossy();
        last_cluster_byte_len(&text)
    }
}

unsafe fn write_c_string(s: &str, out: *mut c_char, out_cap: usize) {
    unsafe {
        if out_cap == 0 {
            return;
        }
        let c_string = CString::new(s.replace('\0', "")).unwrap_or_default();
        let bytes = c_string.as_bytes_with_nul();
        let n = bytes.len().min(out_cap);
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const c_char, out, n);
        if n == out_cap {
            *out.add(out_cap - 1) = 0; // truncated: force NUL-termination
        }
    }
}
