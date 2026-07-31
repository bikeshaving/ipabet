// The IPAbet keystroke engine — hand-ported from js/src/index.ts, which is
// itself ported from macos/Sources/InputController.swift. Tables load from
// spec/ipabet.json at startup (engine_init), exactly like the macOS IME
// loads the same file as a bundled resource — this file is never
// hand-transcribed into source, only the ~300-400 lines of pure transform
// logic are.
//
// Departure from the JS engine, deliberate and documented: JS's Edit.replace
// length is expressed in UTF-16 code units, because that is what JS strings
// are made of. This port has no UTF-16 anywhere — text is handled as Unicode
// codepoint arrays internally (via utf8proc at the UTF-8 boundary), so
// Edit.replace_len here is a codepoint count. A caller bridging to a UTF-8 or
// UTF-16 host buffer must convert; the engine itself never does.
#ifndef IPABET_ENGINE_H
#define IPABET_ENGINE_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

// Loads spec/ipabet.json from `spec_path` and builds every lookup table.
// Must be called once before any other engine_* function. Returns false if
// the file is missing or malformed (a build/packaging bug, not a runtime
// condition to recover from).
bool engine_init(const char *spec_path);

void engine_shutdown(void);

// Capital digraphs (⇧A⇧E → Æ, ⇧S⇧H → Ʃ) are off by default — opt-in, matching
// the JS engine's setCapitalDigraphs.
void engine_set_capital_digraphs(bool on);

// Sets the active locale for ⌥[ / ⌥] quotes (en, de, fr, ch, pl, ru, sv).
// Unknown locales fall back to the spec's default.
void engine_set_quote_locale(const char *locale);

typedef struct {
	// The key's unshifted US-layout label: "a", "5", ";", "Escape", "⌫" …
	// Multi-character labels are ASCII words ("Escape"); everything else is
	// exactly one ASCII byte.
	const char *key;
	bool shift;
	bool option;
	bool shift_broke; // shift was physically RELEASED since the previous keystroke
	bool caps_lock;    // a lock, not a modifier
	bool control;      // only ⌃⇧<letter> is claimed
} Keystroke;

typedef enum {
	EDIT_INSERT,
	EDIT_REPLACE,
	EDIT_PASS,
	EDIT_NOOP,
} EditType;

// Codepoints, not bytes: a glyph plus its stacked marks is at most a handful
// of codepoints, never close to this bound.
#define EDIT_TEXT_MAX 16

typedef struct {
	EditType type;
	int32_t text[EDIT_TEXT_MAX];
	int text_len;      // codepoints in `text` (INSERT, REPLACE)
	int replace_len;   // codepoints to remove from the end of text_before (REPLACE only)
} Edit;

// Diacritics awaiting a base, held by the HOST — never written into the
// document. Each entry is one codepoint, except the two reserved sentinels
// PENDING_RAISE/PENDING_LOWER (negative, so they can never collide with a
// real codepoint, which is always >= 0).
#define PENDING_MAX 8
#define PENDING_RAISE (-1)
#define PENDING_LOWER (-2)

typedef struct {
	int32_t items[PENDING_MAX];
	int count;
} Pending;

typedef struct {
	Edit edit;
	Pending pending;
	bool chain_broken;
	bool has_chain_broken; // Step.chainBroken is optional in the JS engine
} Step;

// text_before: UTF-8, NUL-terminated — the document content up to the caret.
// The engine reads at most a short tail of it (mirrors the JS engine's own
// "small tail window" read).
Step engine_handle_key(const char *text_before, Keystroke k, Pending pending, bool chain_broken);
Step engine_handle_backspace(const char *text_before, Pending pending);
Step engine_handle_unconvert(const char *text_before, Pending pending);

// The dead-key preview: each pending mark as its spacing glyph, UTF-8,
// NUL-terminated into `out` (caller-supplied buffer, `out_size` bytes).
void engine_preview_string(Pending pending, char *out, size_t out_size);

// What an unconsumed pending composition writes when it commits (Esc, space,
// or the end of a keystroke sequence): like engine_preview_string, but an
// operator (raise/lower armed with nothing to raise/lower) contributes
// nothing instead of its small-mark glyph — committing lets it lift, only
// previewing shows it.
void engine_commit_string(Pending pending, char *out, size_t out_size);

// The native (US) character a keystroke would type, for pass fallbacks.
// UTF-8, NUL-terminated into `out`.
void engine_native_char(Keystroke k, char *out, size_t out_size);

// Applies `edit` to `text_before` (UTF-8), writing the result into `out`
// (caller-supplied buffer, `out_size` bytes). `native` is what a PASS edit
// appends (from engine_native_char), matching applyEdit(text, edit, native).
void engine_apply_edit(const char *text_before, Edit edit, const char *native, char *out, size_t out_size);

// The byte length of the last grapheme cluster (a base codepoint plus any
// trailing combining marks) in `text_before`, or 0 if it's empty. For a host
// implementing its own native single-character delete when the engine
// declines a backspace (PASS) — mirrors what typeKeys' test-replay harness
// does by hand, and what a real host's native backspace does regardless.
int engine_last_cluster_byte_len(const char *text_before);

#endif
