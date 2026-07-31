// The IPAbet keystroke engine, hand-ported from js/src/index.ts. Section
// comments mirror the reference file so the two can be read side by side.
//
// Internal representation: everything past the UTF-8 boundary is codepoints
// (int32_t), never UTF-16 or raw bytes — Edit.replace_len is a codepoint
// count (see engine.h). Unicode normalization (NFD/NFC) and general-category
// lookups come from the vendored utf8proc (linux/third_party/utf8proc),
// standing in for JS's built-in .normalize()/Intl.Segmenter.

#include "engine.h"
#include "json.h"
#include "../third_party/utf8proc/utf8proc.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// -------------------------------------------------------------- utf-8/cp

static int decode_utf8(const char *s, int32_t *out, int cap) {
	int n = 0;
	utf8proc_ssize_t len = (utf8proc_ssize_t)strlen(s);
	utf8proc_ssize_t i = 0;
	while (i < len && n < cap) {
		int32_t cp;
		utf8proc_ssize_t used = utf8proc_iterate((const utf8proc_uint8_t *)s + i, len - i, &cp);
		if (used <= 0) break;
		out[n++] = cp;
		i += used;
	}
	return n;
}

static void encode_utf8(const int32_t *cps, int len, char *out, size_t out_size) {
	size_t pos = 0;
	for (int i = 0; i < len; i++) {
		char buf[4];
		utf8proc_ssize_t n = utf8proc_encode_char(cps[i], (utf8proc_uint8_t *)buf);
		if (n < 0 || pos + (size_t)n >= out_size) break;
		memcpy(out + pos, buf, (size_t)n);
		pos += (size_t)n;
	}
	out[pos] = '\0';
}

// The one codepoint of a spec string field known to hold exactly one
// (verified against spec/ipabet.json at authoring time: every mark, double,
// clone, doubleClone, cycle entry, and letters glyph is a single codepoint).
static int32_t first_cp(const char *utf8) {
	int32_t cp;
	utf8proc_iterate((const utf8proc_uint8_t *)utf8, (utf8proc_ssize_t)strlen(utf8), &cp);
	return cp;
}

static bool is_combining(int32_t cp) {
	const utf8proc_property_t *p = utf8proc_get_property(cp);
	return p->category == UTF8PROC_CATEGORY_MN || p->category == UTF8PROC_CATEGORY_MC
		|| p->category == UTF8PROC_CATEGORY_ME;
}

// -------------------------------------------------------------- tables

typedef struct { char *key; char *value; } StrPair;
typedef struct { StrPair *items; int count; int cap; } StrMap;

static void strmap_set(StrMap *m, const char *key, const char *value) {
	if (m->count == m->cap) {
		m->cap = m->cap == 0 ? 32 : m->cap * 2;
		m->items = realloc(m->items, (size_t)m->cap * sizeof(StrPair));
	}
	m->items[m->count].key = strdup(key);
	m->items[m->count].value = strdup(value);
	m->count++;
}

static const char *strmap_get(const StrMap *m, const char *key) {
	for (int i = 0; i < m->count; i++) if (strcmp(m->items[i].key, key) == 0) return m->items[i].value;
	return NULL;
}

static bool strmap_has(const StrMap *m, const char *key) {
	return strmap_get(m, key) != NULL;
}

typedef struct { int32_t *keys; int32_t *values; int count; int cap; } CpCpMap;

static void cpcp_set(CpCpMap *m, int32_t key, int32_t value) {
	if (m->count == m->cap) {
		m->cap = m->cap == 0 ? 32 : m->cap * 2;
		m->keys = realloc(m->keys, (size_t)m->cap * sizeof(int32_t));
		m->values = realloc(m->values, (size_t)m->cap * sizeof(int32_t));
	}
	m->keys[m->count] = key;
	m->values[m->count] = value;
	m->count++;
}

// Only sets if `key` isn't already present — mirrors the JS "first key wins"
// pattern (`if (!unsup.has(sup)) unsup.set(sup, base)`).
static void cpcp_set_first(CpCpMap *m, int32_t key, int32_t value);

static bool cpcp_get(const CpCpMap *m, int32_t key, int32_t *out) {
	for (int i = 0; i < m->count; i++) if (m->keys[i] == key) { *out = m->values[i]; return true; }
	return false;
}

static bool cpcp_has(const CpCpMap *m, int32_t key) {
	int32_t v;
	return cpcp_get(m, key, &v);
}

static void cpcp_set_first(CpCpMap *m, int32_t key, int32_t value) {
	if (!cpcp_has(m, key)) cpcp_set(m, key, value);
}

typedef struct {
	int32_t mark;
	bool spacing;
	bool has_double;
	int32_t dbl;
	bool double_spacing;
	int32_t cycle[8];
	int cycle_len;
	int32_t double_cycle[8];
	int double_cycle_len;
	bool has_clone;
} MarkEntry;

static MarkEntry opt_marks[128];
static bool opt_marks_present[128];

typedef struct {
	char locale[8];
	int32_t quad[4];
} QuoteLocaleEntry;

static StrMap letters;      // key label ("s", "5H") or glyph -> glyph UTF-8
static StrMap transforms;   // (prev glyph or digit) + modifier char -> glyph UTF-8
static StrMap unconvert_key; // glyph UTF-8 -> key label
static StrMap opt_shift_digits; // single digit char -> replacement UTF-8

static CpCpMap sups, subs, unsup, unsub, exclusive_twin, clone_of;

#define PENDING_RAISE_CP INT32_MIN // never a real codepoint; distinct sentinel key in clone_of/exclusive_twin

static QuoteLocaleEntry quote_locales[16];
static int quote_locale_count = 0;
static int quote_default_index = 0;
static int quote_active_index = 0;

static bool capital_digraphs = false;

void engine_set_capital_digraphs(bool on) { capital_digraphs = on; }

// STROKED / TILDED are hand-authored constants in the JS engine too, not
// spec-driven — transcribed verbatim, not generated.
typedef struct { char key; int32_t value; } CharCp;
static const CharCp STROKED[] = {
	{'l', 0x0142}, {'L', 0x0141}, {'d', 0x0111}, {'D', 0x0110}, {'t', 0x0167}, {'T', 0x0166},
	{'g', 0x01E5}, {'G', 0x01E4}, {'h', 0x0127}, {'H', 0x0126}, {'b', 0x0180}, {'B', 0x0243},
	{'z', 0x01B6}, {'Z', 0x01B5}, {'i', 0x0268}, {'I', 0x0197}, {'u', 0x0289}, {'U', 0x0244},
	{'o', 0x0275}, {'O', 0x019F}, {'j', 0x025F}, {'r', 0x024D}, {'R', 0x024C}, {'y', 0x024F},
	{'Y', 0x024E}, {'c', 0x023C}, {'C', 0x023B}, {'p', 0x1D7D}, {'P', 0x2C63}, {'k', 0xA741},
	{'K', 0xA740}, {'2', 0x01BB},
};
static const CharCp TILDED[] = {
	{'l', 0x026B}, {'L', 0x2C62}, {'b', 0x1D6C}, {'d', 0x1D6D}, {'f', 0x1D6E}, {'m', 0x1D6F},
	{'n', 0x1D70}, {'p', 0x1D71}, {'r', 0x1D72}, {'s', 0x1D74}, {'t', 0x1D75}, {'z', 0x1D76},
};
static bool char_table_get(const CharCp *table, int n, char key, int32_t *out) {
	for (int i = 0; i < n; i++) if (table[i].key == key) { *out = table[i].value; return true; }
	return false;
}

typedef struct { int32_t seq[3]; int seq_len; int32_t atom; } Contour;
static const Contour CONTOURS[] = {
	{{0x030F, 0x030B}, 2, 0x030C},
	{{0x030B, 0x030F}, 2, 0x0302},
	{{0x0301, 0x030B}, 2, 0x1DC4},
	{{0x030F, 0x0300}, 2, 0x1DC5},
	{{0x0304, 0x0301, 0x0304}, 3, 0x1DC8},
	{{0x0304, 0x0300}, 2, 0x1DC6},
	{{0x0301, 0x0304}, 2, 0x1DC7},
	{{0x0301, 0x0300, 0x0301}, 3, 0x1DC9},
};
#define CONTOURS_LEN (int)(sizeof(CONTOURS) / sizeof(CONTOURS[0]))

// US shift plane for digits — matches SHIFTED_DIGITS in the JS engine.
static const char *SHIFTED_DIGITS[10] = {
	[0] = ")", [1] = "!", [2] = "@", [3] = "#", [4] = "$",
	[5] = "%", [6] = "^", [7] = "&", [8] = "*", [9] = "(",
};
static const char *shifted_digit(char d) { return d >= '0' && d <= '9' ? SHIFTED_DIGITS[d - '0'] : NULL; }

static const int32_t TIE_CP = 0x0361;      // ͡
static const int32_t TIE_BELOW_CP = 0x035C; // ͜
static const int32_t OVERTIE_CP = 0x2040;   // ⁀
static const int32_t UNDERTIE_CP = 0x203F;  // ‿

static bool is_combining_tie(int32_t cp) { return cp == TIE_CP || cp == TIE_BELOW_CP || cp == 0x0362 /* SLIDE ͢ , unused by any table but kept for parity */; }
static bool is_spacing_tie(int32_t cp) { return cp == OVERTIE_CP || cp == UNDERTIE_CP; }

// ---------------------------------------------------------------- init

bool engine_init(const char *spec_path) {
	JsonValue *root = json_parse_file(spec_path);
	if (root == NULL) return false;

	const JsonValue *letters_arr = json_get(root, "letters");
	if (letters_arr == NULL || letters_arr->type != JSON_ARRAY) { json_free(root); return false; }
	for (size_t i = 0; i < letters_arr->as.array.count; i++) {
		const JsonValue *e = letters_arr->as.array.items[i];
		strmap_set(&letters, json_str(json_get(e, "key")), json_str(json_get(e, "glyph")));
	}

	const JsonValue *marks_arr = json_get(root, "marks");
	if (marks_arr == NULL || marks_arr->type != JSON_ARRAY) { json_free(root); return false; }
	for (size_t i = 0; i < marks_arr->as.array.count; i++) {
		const JsonValue *e = marks_arr->as.array.items[i];
		const char *opt = json_str(json_get(e, "opt"));
		if (opt[0] == '\0' || (unsigned char)opt[0] >= 128) continue;
		MarkEntry m = {0};
		m.mark = first_cp(json_str(json_get(e, "mark")));
		m.spacing = strcmp(json_str(json_get(e, "type")), "spacing") == 0;
		const JsonValue *dbl_v = json_get(e, "double");
		if (dbl_v != NULL && dbl_v->type == JSON_STRING) { m.has_double = true; m.dbl = first_cp(dbl_v->as.string); }
		m.double_spacing = json_bool(json_get(e, "doubleSpacing")) != 0;
		const JsonValue *cyc = json_get(e, "cycle");
		if (cyc != NULL && cyc->type == JSON_ARRAY) {
			for (size_t j = 0; j < cyc->as.array.count && j < 8; j++) m.cycle[m.cycle_len++] = first_cp(json_str(cyc->as.array.items[j]));
		}
		const JsonValue *dcyc = json_get(e, "doubleCycle");
		if (dcyc != NULL && dcyc->type == JSON_ARRAY) {
			for (size_t j = 0; j < dcyc->as.array.count && j < 8; j++) m.double_cycle[m.double_cycle_len++] = first_cp(json_str(dcyc->as.array.items[j]));
		}
		const JsonValue *clone_v = json_get(e, "clone");
		if (clone_v != NULL && clone_v->type == JSON_STRING) {
			m.has_clone = true;
			cpcp_set(&clone_of, m.mark, first_cp(clone_v->as.string));
		}
		const JsonValue *dclone_v = json_get(e, "doubleClone");
		if (dclone_v != NULL && dclone_v->type == JSON_STRING && m.has_double) {
			cpcp_set(&clone_of, m.dbl, first_cp(dclone_v->as.string));
		}
		if (json_bool(json_get(e, "exclusive")) && m.has_double) {
			cpcp_set(&exclusive_twin, m.mark, m.dbl);
			cpcp_set(&exclusive_twin, m.dbl, m.mark);
		}
		opt_marks[(unsigned char)opt[0]] = m;
		opt_marks_present[(unsigned char)opt[0]] = true;
	}

	const JsonValue *sups_v = json_get(root, "superscripts");
	const JsonValue *sups_tbl = sups_v != NULL ? json_get(sups_v, "table") : NULL;
	if (sups_tbl != NULL && sups_tbl->type == JSON_ARRAY) {
		for (size_t i = 0; i < sups_tbl->as.array.count; i++) {
			const JsonValue *e = sups_tbl->as.array.items[i];
			int32_t base = first_cp(json_str(json_get(e, "base")));
			int32_t sup = first_cp(json_str(json_get(e, "sup")));
			cpcp_set(&sups, base, sup);
			cpcp_set_first(&unsup, sup, base);
		}
	}
	const JsonValue *subs_v = json_get(root, "subscripts");
	const JsonValue *subs_tbl = subs_v != NULL ? json_get(subs_v, "table") : NULL;
	if (subs_tbl != NULL && subs_tbl->type == JSON_ARRAY) {
		for (size_t i = 0; i < subs_tbl->as.array.count; i++) {
			const JsonValue *e = subs_tbl->as.array.items[i];
			int32_t base = first_cp(json_str(json_get(e, "base")));
			int32_t sub = first_cp(json_str(json_get(e, "sub")));
			cpcp_set(&subs, base, sub);
			cpcp_set_first(&unsub, sub, base);
		}
	}

	// RAISE/LOWER previews — sentinels, not real codepoints, but clone_of is
	// just an int32_t->int32_t table so the sentinel keys slot in cleanly.
	cpcp_set(&clone_of, PENDING_RAISE, 0x207B); // ⁻
	cpcp_set(&clone_of, PENDING_LOWER, 0x208B); // ₋

	// transforms + unconvert_key: mirrors index.ts's single loop over `letters`.
	for (int i = 0; i < letters.count; i++) {
		const char *key = letters.items[i].key;
		const char *glyph = letters.items[i].value;
		if (strlen(key) != 2) continue;
		char prev_buf[2] = {key[0], '\0'};
		const char *prev = NULL;
		if (key[0] >= '0' && key[0] <= '9') prev = prev_buf;
		else prev = strmap_get(&letters, prev_buf);
		if (prev != NULL) {
			char combo_key[8];
			snprintf(combo_key, sizeof(combo_key), "%s%c", prev, key[1]);
			strmap_set(&transforms, combo_key, glyph);
		}
		const char *existing_alias = strmap_get(&letters, glyph);
		if (!strmap_has(&unconvert_key, glyph) && !(existing_alias != NULL && strcmp(existing_alias, glyph) == 0)) {
			strmap_set(&unconvert_key, glyph, key);
		}
	}

	const JsonValue *opt_shift_v = json_get(root, "optShift");
	if (opt_shift_v != NULL && opt_shift_v->type == JSON_OBJECT) {
		for (size_t i = 0; i < opt_shift_v->as.object.count; i++) {
			const char *k = opt_shift_v->as.object.keys[i];
			if (strlen(k) == 1 && k[0] >= '0' && k[0] <= '9') {
				strmap_set(&opt_shift_digits, k, json_str(opt_shift_v->as.object.values[i]));
			}
		}
	}

	const JsonValue *quotes_v = json_get(root, "quotes");
	const char *quote_default = json_str(json_get(quotes_v, "default"));
	const JsonValue *locales_v = json_get(quotes_v, "locales");
	if (locales_v != NULL && locales_v->type == JSON_OBJECT) {
		for (size_t i = 0; i < locales_v->as.object.count && quote_locale_count < 16; i++) {
			const char *loc = locales_v->as.object.keys[i];
			const JsonValue *arr = locales_v->as.object.values[i];
			if (arr->type != JSON_ARRAY || arr->as.array.count != 4) continue;
			QuoteLocaleEntry qle = {0};
			snprintf(qle.locale, sizeof(qle.locale), "%s", loc);
			for (int j = 0; j < 4; j++) qle.quad[j] = first_cp(json_str(arr->as.array.items[j]));
			quote_locales[quote_locale_count] = qle;
			if (strcmp(loc, quote_default) == 0) quote_default_index = quote_locale_count;
			quote_locale_count++;
		}
	}
	quote_active_index = quote_default_index;

	json_free(root);
	return true;
}

void engine_shutdown(void) {
	// Table memory lives for the process lifetime (a short-lived CLI or a
	// long-lived fcitx5 addon that only ever calls engine_init once) — no
	// per-table teardown is implemented; the OS reclaims it on exit.
}

void engine_set_quote_locale(const char *locale) {
	for (int i = 0; i < quote_locale_count; i++) {
		if (strcmp(quote_locales[i].locale, locale) == 0) { quote_active_index = i; return; }
	}
	quote_active_index = quote_default_index;
}

static const int32_t *quote_quad(void) {
	return quote_locales[quote_active_index].quad;
}

// ---------------------------------------------------------------- unicode

// The last "cluster" of `cps` (a base codepoint plus any trailing combining
// marks) as a slice [start, len) of `cps`. -1 if `cps` is empty.
static int last_cluster(const int32_t *cps, int n, int *out_len) {
	if (n == 0) return -1;
	int start = n - 1;
	while (start > 0 && is_combining(cps[start])) start--;
	*out_len = n - start;
	return start;
}

// NFD-decompose `cps[0..len)` into `out` (capacity `cap`), returning the
// decomposed length, or -1 on overflow/error.
static int nfd(const int32_t *cps, int len, int32_t *out, int cap) {
	char utf8[64];
	encode_utf8(cps, len, utf8, sizeof(utf8));
	utf8proc_ssize_t n = utf8proc_decompose((const utf8proc_uint8_t *)utf8, (utf8proc_ssize_t)strlen(utf8),
		out, cap, UTF8PROC_STABLE | UTF8PROC_DECOMPOSE);
	return n < 0 ? -1 : (int)n;
}

// Split a cluster into its base glyph and trailing combining marks (NFD),
// mirroring decompose() in index.ts exactly, including its "once any mark
// appears, everything after goes to marks" rule.
static void decompose(const int32_t *cluster, int cluster_len, int32_t *base, int *base_len,
	int32_t *marks, int *marks_len) {
	int32_t d[32];
	int dn = nfd(cluster, cluster_len, d, 32);
	if (dn < 0) dn = 0;
	*base_len = 0;
	*marks_len = 0;
	for (int i = 0; i < dn; i++) {
		if (*marks_len == 0 && !is_combining(d[i])) base[(*base_len)++] = d[i];
		else marks[(*marks_len)++] = d[i];
	}
}

// utf8proc_normalize_utf32 composes strictly in the order given — unlike a
// real string .normalize("NFC"), it does NOT canonically reorder combining
// marks by class first (verified directly: e+acute+dotbelow and
// e+dotbelow+acute compose to two DIFFERENT precomposed results, é+◌̣ vs
// ẹ+◌́, rather than converging like real NFC does). Canonical ordering sorts
// STABLY by combining class — marks of the same class never swap relative
// order, which is exactly the tone-vs-shape-mark case recompose()'s
// permutation search exists for — so this has to happen by hand before
// composing, on marks only; the base (class 0) stays untouched.
static void canonical_reorder(int32_t *buf, int start, int len) {
	for (int i = start + 1; i < start + len; i++) {
		int32_t v = buf[i];
		int vc = utf8proc_get_property(v)->combining_class;
		int j = i - 1;
		while (j >= start && utf8proc_get_property(buf[j])->combining_class > vc) {
			buf[j + 1] = buf[j];
			j--;
		}
		buf[j + 1] = v;
	}
}

static void permute_recompose_best(int32_t *base, int base_len, int32_t *marks, int marks_len,
	int32_t *scratch, bool *used, int depth, int32_t *best, int *best_len) {
	if (depth == marks_len) {
		int32_t buf[32];
		int bn = 0;
		for (int i = 0; i < base_len; i++) buf[bn++] = base[i];
		for (int i = 0; i < marks_len; i++) buf[bn++] = scratch[i];
		canonical_reorder(buf, base_len, marks_len);
		utf8proc_ssize_t n = utf8proc_normalize_utf32(buf, bn, UTF8PROC_STABLE | UTF8PROC_DECOMPOSE | UTF8PROC_COMPOSE);
		if (n >= 0 && (*best_len < 0 || (int)n < *best_len)) {
			*best_len = (int)n;
			memcpy(best, buf, (size_t)n * sizeof(int32_t));
		}
		return;
	}
	for (int i = 0; i < marks_len; i++) {
		if (used[i]) continue;
		used[i] = true;
		scratch[depth] = marks[i];
		permute_recompose_best(base, base_len, marks, marks_len, scratch, used, depth + 1, best, best_len);
		used[i] = false;
	}
}

// Recomposes base+marks to its shortest NFC spelling, trying every mark
// permutation when there's more than one — mirrors recompose() exactly: two
// marks of the same combining class never reorder under NFC, so which one is
// typed first can determine whether they fuse into one precomposed glyph.
static int recompose(const int32_t *base, int base_len, const int32_t *marks, int marks_len, int32_t *out) {
	if (marks_len <= 1) {
		int32_t buf[32];
		int bn = 0;
		for (int i = 0; i < base_len; i++) buf[bn++] = base[i];
		for (int i = 0; i < marks_len; i++) buf[bn++] = marks[i];
		canonical_reorder(buf, base_len, marks_len);
		utf8proc_ssize_t n = utf8proc_normalize_utf32(buf, bn, UTF8PROC_STABLE | UTF8PROC_DECOMPOSE | UTF8PROC_COMPOSE);
		if (n < 0) n = 0;
		memcpy(out, buf, (size_t)n * sizeof(int32_t));
		return (int)n;
	}
	int32_t base_copy[32], marks_copy[32], scratch[32];
	memcpy(base_copy, base, (size_t)base_len * sizeof(int32_t));
	memcpy(marks_copy, marks, (size_t)marks_len * sizeof(int32_t));
	bool used[32] = {0};
	int32_t best[32];
	int best_len = -1;
	permute_recompose_best(base_copy, base_len, marks_copy, marks_len, scratch, used, 0, best, &best_len);
	if (best_len < 0) return 0;
	memcpy(out, best, (size_t)best_len * sizeof(int32_t));
	return best_len;
}

static Edit replace_cluster(int cluster_len, const int32_t *text, int text_len) {
	Edit e = {.type = EDIT_REPLACE, .replace_len = cluster_len, .text_len = text_len};
	if (text_len > 0) memcpy(e.text, text, (size_t)text_len * sizeof(int32_t));
	return e;
}

static Edit insert_edit(const int32_t *text, int text_len) {
	Edit e = {.type = EDIT_INSERT, .text_len = text_len};
	if (text_len > 0) memcpy(e.text, text, (size_t)text_len * sizeof(int32_t));
	return e;
}

static Edit noop_edit(void) { return (Edit){.type = EDIT_NOOP}; }
static Edit pass_edit(void) { return (Edit){.type = EDIT_PASS}; }

// ------------------------------------------------------------------ marks

// The dead-key preview / commit string: each pending mark as its spacing
// clone (falling back to itself if there is no clone), operators contribute
// nothing to a COMMIT but preview as their small-mark glyph.
static int render_pending(const Pending *pending, bool skip_operators, int32_t *out) {
	int n = 0;
	for (int i = 0; i < pending->count; i++) {
		int32_t sc = pending->items[i];
		bool is_op = sc == PENDING_RAISE || sc == PENDING_LOWER;
		if (skip_operators && is_op) continue;
		int32_t c;
		out[n++] = cpcp_get(&clone_of, sc, &c) ? c : sc;
	}
	return n;
}

void engine_preview_string(Pending pending, char *out, size_t out_size) {
	int32_t buf[PENDING_MAX];
	int n = render_pending(&pending, false, buf);
	encode_utf8(buf, n, out, out_size);
}

void engine_commit_string(Pending pending, char *out, size_t out_size) {
	int32_t buf[PENDING_MAX];
	int n = render_pending(&pending, true, buf);
	encode_utf8(buf, n, out, out_size);
}

static int commit_codepoints(const Pending *pending, int32_t *out) {
	return render_pending(pending, true, out);
}

// Commit an unconsumed accent as its spacing form (⌥e then space → ´).
static Step flush(Pending pending) {
	if (pending.count == 0) return (Step){.edit = noop_edit(), .pending = pending};
	int32_t text[PENDING_MAX];
	int n = commit_codepoints(&pending, text);
	Pending empty = {0};
	if (n == 0) return (Step){.edit = noop_edit(), .pending = empty};
	return (Step){.edit = insert_edit(text, n), .pending = empty};
}

// The contour this mark completes, consuming the levels before it, or NULL
// (via out_found) if `scalar` doesn't complete any known contour.
static bool contour_of(const Pending *pending, int32_t scalar, Step *out) {
	for (int len = 3; len >= 2; len--) {
		int keep = pending->count - (len - 1);
		if (keep < 0) continue;
		int32_t seq[3];
		int sn = 0;
		for (int i = keep; i < pending->count; i++) seq[sn++] = pending->items[i];
		seq[sn++] = scalar;
		for (int c = 0; c < CONTOURS_LEN; c++) {
			if (CONTOURS[c].seq_len != sn) continue;
			if (memcmp(CONTOURS[c].seq, seq, (size_t)sn * sizeof(int32_t)) != 0) continue;
			Pending next = {0};
			for (int i = 0; i < keep; i++) next.items[next.count++] = pending->items[i];
			next.items[next.count++] = CONTOURS[c].atom;
			*out = (Step){.edit = noop_edit(), .pending = next};
			return true;
		}
	}
	return false;
}

// Stack a diacritic into the pending composition. The same form again peels
// it off, unless the key declares a CYCLE, which advances and wraps.
static Step pending_diacritic(int32_t scalar, Pending pending, const int32_t *cycle, int cycle_len) {
	Step contour;
	if (contour_of(&pending, scalar, &contour)) return contour;
	Pending next = {0};
	int32_t top = pending.count > 0 ? pending.items[pending.count - 1] : PENDING_RAISE_CP /* never matches: no real pending value equals INT32_MIN */;
	// family = [scalar, ...cycle]
	int32_t family[9];
	int family_len = 0;
	family[family_len++] = scalar;
	for (int i = 0; i < cycle_len; i++) family[family_len++] = cycle[i];
	int at = -1;
	if (pending.count > 0) for (int i = 0; i < family_len; i++) if (family[i] == top) { at = i; break; }
	if (at >= 0 && cycle_len > 0) {
		for (int i = 0; i < pending.count - 1; i++) next.items[next.count++] = pending.items[i];
		next.items[next.count++] = family[(at + 1) % family_len];
	} else if (pending.count > 0 && top == scalar) {
		for (int i = 0; i < pending.count - 1; i++) next.items[next.count++] = pending.items[i];
	} else {
		int32_t twin;
		bool has_twin = cpcp_get(&exclusive_twin, scalar, &twin);
		for (int i = 0; i < pending.count; i++) {
			if (has_twin && pending.items[i] == twin) continue;
			next.items[next.count++] = pending.items[i];
		}
		next.items[next.count++] = scalar;
	}
	return (Step){.edit = noop_edit(), .pending = next};
}

// Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form.
static Step apply_mark(const MarkEntry *m, Pending pending, bool secondary) {
	int32_t scalar = (secondary && m->has_double) ? m->dbl : m->mark;
	bool spacing = (secondary && m->has_double) ? m->double_spacing : m->spacing;
	if (!spacing) {
		const int32_t *cyc = secondary ? m->double_cycle : m->cycle;
		int cyc_len = secondary ? m->double_cycle_len : m->cycle_len;
		return pending_diacritic(scalar, pending, cyc, cyc_len);
	}
	Step f = flush(pending);
	int32_t text[PENDING_MAX + 1];
	int n = 0;
	if (f.edit.type == EDIT_INSERT) { memcpy(text, f.edit.text, (size_t)f.edit.text_len * sizeof(int32_t)); n = f.edit.text_len; }
	text[n++] = scalar;
	Pending empty = {0};
	return (Step){.edit = insert_edit(text, n), .pending = empty};
}

// Emit a base glyph (codepoints), committing any pending prefix diacritics.
static Step emit_base_cp(const int32_t *glyph, int glyph_len, Pending pending) {
	Pending empty = {0};
	if (pending.count == 0) return (Step){.edit = insert_edit(glyph, glyph_len), .pending = empty};
	// Raise/lower substitutes the glyph itself; any marks then ride the result.
	int op_index = -1;
	for (int i = 0; i < pending.count; i++) if (pending.items[i] == PENDING_RAISE || pending.items[i] == PENDING_LOWER) { op_index = i; break; }
	if (op_index >= 0) {
		int32_t op = pending.items[op_index];
		int32_t rest[PENDING_MAX];
		int rest_len = 0;
		for (int i = 0; i < pending.count; i++) if (i != op_index) rest[rest_len++] = pending.items[i];
		int32_t moved;
		bool found = glyph_len == 1 && cpcp_get(op == PENDING_RAISE ? &sups : &subs, glyph[0], &moved);
		int32_t base1[1] = {found ? moved : (glyph_len == 1 ? glyph[0] : 0)};
		int32_t out[32];
		int n = glyph_len == 1 ? recompose(base1, 1, rest, rest_len, out) : recompose(glyph, glyph_len, rest, rest_len, out);
		return (Step){.edit = insert_edit(out, n), .pending = empty};
	}
	// tilde overlay: middle-tilde atoms — ɫ is also a digraph, l⇧Q
	if (pending.count == 1 && pending.items[0] == 0x0334 && glyph_len == 1) {
		int32_t t;
		if (glyph[0] >= 0 && glyph[0] < 128 && char_table_get(TILDED, sizeof(TILDED)/sizeof(TILDED[0]), (char)glyph[0], &t)) {
			int32_t one[1] = {t};
			return (Step){.edit = insert_edit(one, 1), .pending = empty};
		}
	}
	// stroke overlay: orthographic letters are precomposed (⌥y l → ł, ⌥y d → đ)
	if (pending.count == 1 && pending.items[0] == 0x0335 && glyph_len == 1) {
		int32_t s;
		if (glyph[0] >= 0 && glyph[0] < 128 && char_table_get(STROKED, sizeof(STROKED)/sizeof(STROKED[0]), (char)glyph[0], &s)) {
			int32_t one[1] = {s};
			return (Step){.edit = insert_edit(one, 1), .pending = empty};
		}
	}
	int32_t out[32];
	int n = recompose(glyph, glyph_len, pending.items, pending.count, out);
	return (Step){.edit = insert_edit(out, n), .pending = empty};
}

static Step emit_base_str(const char *glyph_utf8, Pending pending) {
	int32_t cps[8];
	int n = decode_utf8(glyph_utf8, cps, 8);
	return emit_base_cp(cps, n, pending);
}

// ⌥z / ⌥⇧z: arm the raise or the lower. Same chord again lifts it; the twin
// replaces.
static Step pending_operator(int32_t op, Pending pending) {
	Pending next = {0};
	bool has_op = false;
	for (int i = 0; i < pending.count; i++) if (pending.items[i] == op) has_op = true;
	if (has_op) {
		for (int i = 0; i < pending.count; i++) if (pending.items[i] != op) next.items[next.count++] = pending.items[i];
		return (Step){.edit = noop_edit(), .pending = next};
	}
	int32_t twin = op == PENDING_RAISE ? PENDING_LOWER : PENDING_RAISE;
	for (int i = 0; i < pending.count; i++) if (pending.items[i] != twin) next.items[next.count++] = pending.items[i];
	next.items[next.count++] = op;
	return (Step){.edit = noop_edit(), .pending = next};
}

// ⌥j / ⌥⇧j: attach the affricate joiner, or emit the standalone spacing tie.
static Step emit_joiner(const int32_t *tail_cps, int tail_len, int32_t start, Pending pending) {
	int32_t spacing = start == TIE_CP ? OVERTIE_CP : UNDERTIE_CP;
	if (pending.count == 0) {
		int len;
		int idx = last_cluster(tail_cps, tail_len, &len);
		int32_t last = idx >= 0 ? tail_cps[tail_len - 1] : -1;
		if (idx >= 0 && (is_combining_tie(last) || is_spacing_tie(last))) {
			int32_t one[1] = {spacing};
			return (Step){.edit = replace_cluster(1, one, 1), .pending = {0}};
		}
		bool is_space = last >= 0 && (last == ' ' || last == '\t' || last == '\n');
		if (idx < 0 || is_space) {
			int32_t one[1] = {spacing};
			return (Step){.edit = insert_edit(one, 1), .pending = {0}};
		}
	}
	int32_t s[1] = {start};
	return emit_base_cp(s, 1, pending);
}

// ---------------------------------------------------------------- engine

static Step handle_key_core(const int32_t *text_cps, int text_len, Keystroke k, Pending pending, bool chain_live);

Step engine_handle_key(const char *text_before, Keystroke k, Pending pending, bool chain_broken) {
	int32_t text_cps[4096];
	int text_len = decode_utf8(text_before, text_cps, 4096);
	bool broken_in = chain_broken || k.shift_broke;
	Step step = handle_key_core(text_cps, text_len, k, pending, !broken_in);
	bool seg = step.edit.type == EDIT_REPLACE;
	if (!seg && step.edit.type == EDIT_INSERT) {
		for (int i = 0; i < step.edit.text_len; i++) if (step.edit.text[i] > 0x7f) { seg = true; break; }
	}
	step.chain_broken = seg ? false : broken_in;
	step.has_chain_broken = true;
	return step;
}

// A leading digit is a literal base a modifier transforms (5H → ɜ).
static Step with_flush(Edit edit, Pending pending, Keystroke k, bool for_pass_use_native) {
	if (pending.count == 0) return (Step){.edit = edit, .pending = pending};
	int32_t pre[PENDING_MAX];
	int pre_n = commit_codepoints(&pending, pre);
	Pending empty = {0};
	if (pre_n == 0) return (Step){.edit = edit, .pending = empty};
	if (edit.type == EDIT_INSERT) {
		int32_t buf[PENDING_MAX + EDIT_TEXT_MAX];
		memcpy(buf, pre, (size_t)pre_n * sizeof(int32_t));
		memcpy(buf + pre_n, edit.text, (size_t)edit.text_len * sizeof(int32_t));
		return (Step){.edit = insert_edit(buf, pre_n + edit.text_len), .pending = empty};
	}
	if (edit.type == EDIT_PASS) {
		int32_t native[4];
		int nn = 0;
		if (for_pass_use_native && strlen(k.key) == 1) {
			char nbuf[8];
			engine_native_char(k, nbuf, sizeof(nbuf));
			nn = decode_utf8(nbuf, native, 4);
		}
		int32_t buf[PENDING_MAX + 4];
		memcpy(buf, pre, (size_t)pre_n * sizeof(int32_t));
		memcpy(buf + pre_n, native, (size_t)nn * sizeof(int32_t));
		return (Step){.edit = insert_edit(buf, pre_n + nn), .pending = empty};
	}
	return (Step){.edit = edit, .pending = empty};
}

// A capital digraph capitalizes its result; a plain-ASCII result is excluded
// (⇧T⇧J stays "TJ"). ʔ is caseless in Unicode — Ɂ is the one hand map.
static bool capital_of(int32_t low, int32_t *out) {
	if (low == 0x0294) { *out = 0x0241; return true; } // ʔ → Ɂ
	int32_t up = utf8proc_toupper(low);
	if (up != low && up > 0x7f) { *out = up; return true; }
	return false;
}

static Step handle_key_core(const int32_t *text_cps, int text_len, Keystroke k, Pending pending, bool chain_live) {
	const char *key = k.key;
	bool shift = k.shift, option = k.option;

	if (strcmp(key, "Escape") == 0 && !k.control && !option) {
		if (pending.count > 0) return flush(pending);
		return (Step){.edit = pass_edit(), .pending = pending};
	}
	if (strlen(key) != 1) return (Step){.edit = pass_edit(), .pending = pending};
	char kc = key[0];

	if (k.control) {
		if (shift && kc >= 'a' && kc <= 'z') {
			int32_t up[1] = {kc - 'a' + 'A'};
			return with_flush(insert_edit(up, 1), pending, k, false);
		}
		return (Step){.edit = pass_edit(), .pending = pending};
	}

	if (kc == ' ' && !option && pending.count > 0) {
		Step f = flush(pending);
		if (f.edit.type == EDIT_NOOP) return (Step){.edit = pass_edit(), .pending = (Pending){0}};
		return f;
	}

	if (option && shift) {
		if (kc == 'j') return emit_joiner(text_cps, text_len, TIE_BELOW_CP, pending);
		if (kc == 'z') return pending_operator(PENDING_LOWER, pending);
		if (kc == '[') { int32_t q[1] = {quote_quad()[1]}; return with_flush(insert_edit(q, 1), pending, k, false); }
		if (kc == ']') { int32_t q[1] = {quote_quad()[3]}; return with_flush(insert_edit(q, 1), pending, k, false); }
		if ((unsigned char)kc < 128 && opt_marks_present[(unsigned char)kc]) {
			MarkEntry *m = &opt_marks[(unsigned char)kc];
			if (m->has_double) return apply_mark(m, pending, true);
		}
		if (kc >= '0' && kc <= '9') {
			const char *over = strmap_get(&opt_shift_digits, (char[]){kc, 0});
			if (over != NULL) { int32_t cps[4]; int n = decode_utf8(over, cps, 4); return with_flush(insert_edit(cps, n), pending, k, false); }
			char kbuf[2] = {kc, 0};
			if (strmap_has(&letters, kbuf)) {
				const char *sd = shifted_digit(kc);
				int32_t cps[4]; int n = sd != NULL ? decode_utf8(sd, cps, 4) : (cps[0] = kc, 1);
				return with_flush(insert_edit(cps, n), pending, k, false);
			}
		}
		return with_flush(pass_edit(), pending, k, true);
	}

	if (option) {
		if (kc == 'j') return emit_joiner(text_cps, text_len, TIE_CP, pending);
		if (kc == '[') { int32_t q[1] = {quote_quad()[0]}; return with_flush(insert_edit(q, 1), pending, k, false); }
		if (kc == ']') { int32_t q[1] = {quote_quad()[2]}; return with_flush(insert_edit(q, 1), pending, k, false); }
		if (kc == 'r' && pending.count == 0) {
			int len;
			int idx = last_cluster(text_cps, text_len, &len);
			if (idx >= 0) {
				int32_t base[32], marks[32]; int bn, mn;
				decompose(text_cps + idx, len, base, &bn, marks, &mn);
				if (bn == 1 && base[0] == 0x0259 /* ə */) {
					int32_t out[32]; int32_t r[1] = {0x025A}; int n = recompose(r, 1, marks, mn, out);
					return with_flush(replace_cluster(len, out, n), pending, k, false);
				}
				if (bn == 1 && base[0] == 0x025C /* ɜ */) {
					int32_t out[32]; int32_t r[1] = {0x025D}; int n = recompose(r, 1, marks, mn, out);
					return with_flush(replace_cluster(len, out, n), pending, k, false);
				}
			}
		}
		if (kc == '.' && pending.count == 1 && pending.items[0] == 0x0307) {
			int32_t one[1] = {0x00B7};
			return (Step){.edit = insert_edit(one, 1), .pending = (Pending){0}};
		}
		if ((unsigned char)kc < 128 && opt_marks_present[(unsigned char)kc]) {
			return apply_mark(&opt_marks[(unsigned char)kc], pending, false);
		}
		if (kc == 'z') return pending_operator(PENDING_RAISE, pending);
		return with_flush(pass_edit(), pending, k, true);
	}

	if (kc >= '0' && kc <= '9') {
		if (!shift && pending.count > 0) { int32_t g[1] = {kc}; return emit_base_cp(g, 1, pending); }
		if (!shift) return with_flush(pass_edit(), pending, k, true);
	}

	if (k.caps_lock && !shift && kc >= 'a' && kc <= 'z') {
		int32_t up[1] = {kc - 'a' + 'A'};
		return emit_base_cp(up, 1, pending);
	}

	// The modifier character: the shifted letter's capital, or the shifted
	// digit's US symbol (the spec spells ⇧5 as "%": e% → ɜ).
	char s_buf[2];
	if (shift) {
		const char *sd = shifted_digit(kc);
		if (sd != NULL) { s_buf[0] = sd[0]; s_buf[1] = 0; }
		else { s_buf[0] = (kc >= 'a' && kc <= 'z') ? (char)(kc - 'a' + 'A') : kc; s_buf[1] = 0; }
	} else { s_buf[0] = kc; s_buf[1] = 0; }

	int p_len;
	int p_idx = pending.count == 0 ? last_cluster(text_cps, text_len, &p_len) : -1;
	if (p_idx >= 0) {
		int32_t base[32], marks[32]; int base_len, marks_len;
		decompose(text_cps + p_idx, p_len, base, &base_len, marks, &marks_len);

		if (shift && !k.caps_lock && base_len == 1 && base[0] >= 'A' && base[0] <= 'Z') {
			int32_t before_cluster_len = p_idx;
			int len2;
			int idx2 = last_cluster(text_cps, before_cluster_len, &len2);
			bool p2_segment = false;
			if (idx2 >= 0) {
				for (int i = idx2; i < before_cluster_len; i++) {
					int32_t c = text_cps[i];
					if (c > 127) {
						const utf8proc_property_t *pr = utf8proc_get_property(c);
						if ((pr->category >= UTF8PROC_CATEGORY_LU && pr->category <= UTF8PROC_CATEGORY_LO)
							|| pr->category == UTF8PROC_CATEGORY_MN || pr->category == UTF8PROC_CATEGORY_MC
							|| pr->category == UTF8PROC_CATEGORY_ME) { p2_segment = true; break; }
					}
				}
			}
			if (p2_segment && chain_live) {
				base[0] = base[0] - 'A' + 'a';
			} else if (capital_digraphs) {
				char low_key[8];
				snprintf(low_key, sizeof(low_key), "%c%s", (char)(base[0] - 'A' + 'a'), s_buf);
				const char *low = strmap_get(&transforms, low_key);
				if (low != NULL) {
					int32_t low_cp = first_cp(low);
					int32_t up;
					if (capital_of(low_cp, &up)) {
						int32_t out[32]; int n = recompose(&up, 1, marks, marks_len, out);
						return (Step){.edit = replace_cluster(p_len, out, n), .pending = (Pending){0}};
					}
				}
			}
		}
		if (capital_digraphs && shift && chain_live && !k.caps_lock) {
			for (int d = 0; d < 10; d++) {
				const char *sd = SHIFTED_DIGITS[d];
				if (base_len == 1 && sd[0] == base[0] && sd[1] == '\0') {
					char digit_key[8];
					snprintf(digit_key, sizeof(digit_key), "%d%s", d, s_buf);
					const char *low = strmap_get(&transforms, digit_key);
					if (low != NULL) {
						int32_t low_cp = first_cp(low);
						int32_t up;
						if (capital_of(low_cp, &up)) {
							int32_t out[32]; int n = recompose(&up, 1, marks, marks_len, out);
							return (Step){.edit = replace_cluster(p_len, out, n), .pending = (Pending){0}};
						}
					}
					break;
				}
			}
		}
		char combo_key[64];
		encode_utf8(base, base_len, combo_key, sizeof(combo_key) - 2);
		strncat(combo_key, s_buf, 1);
		const char *combo = strmap_get(&transforms, combo_key);
		if (combo != NULL) {
			int32_t cg[8]; int cgn = decode_utf8(combo, cg, 8);
			int32_t out[32]; int n = recompose(cg, cgn, marks, marks_len, out);
			return (Step){.edit = replace_cluster(p_len, out, n), .pending = (Pending){0}};
		}
		// A raised or lowered glyph still transforms: unraise, transform, re-raise.
		if (base_len == 1) {
			int32_t plain;
			bool is_sup = cpcp_get(&unsup, base[0], &plain);
			bool is_sub = !is_sup && cpcp_get(&unsub, base[0], &plain);
			if (is_sup || is_sub) {
				char plain_utf8[8]; encode_utf8(&plain, 1, plain_utf8, sizeof(plain_utf8));
				char pk[16]; snprintf(pk, sizeof(pk), "%s%s", plain_utf8, s_buf);
				const char *t = strmap_get(&transforms, pk);
				if (t != NULL) {
					int32_t t_cp = first_cp(t);
					int32_t back;
					bool ok = cpcp_get(is_sup ? &sups : &subs, t_cp, &back);
					if (ok) {
						int32_t out[32]; int n = recompose(&back, 1, marks, marks_len, out);
						return (Step){.edit = replace_cluster(p_len, out, n), .pending = (Pending){0}};
					}
				}
			}
		}
	}

	// letter / click base glyph — committing any pending prefix diacritics
	const char *glyph = strmap_get(&letters, s_buf);
	if (glyph != NULL) return emit_base_str(glyph, pending);

	// A pending accent absorbs onto a CAPITAL base (⌥u ⇧A → Ä).
	if (pending.count > 0 && s_buf[0] >= 'A' && s_buf[0] <= 'Z') {
		int32_t g[1] = {s_buf[0]};
		return emit_base_cp(g, 1, pending);
	}

	return with_flush(pass_edit(), pending, k, true);
}

Step engine_handle_backspace(const char *text_before, Pending pending) {
	if (pending.count > 0) {
		Pending next = pending;
		next.count--;
		return (Step){.edit = noop_edit(), .pending = next};
	}
	int32_t text_cps[4096];
	int text_len = decode_utf8(text_before, text_cps, 4096);
	int len;
	int idx = last_cluster(text_cps, text_len, &len);
	if (idx < 0) return (Step){.edit = pass_edit(), .pending = (Pending){0}};
	int32_t base[32], marks[32]; int base_len, marks_len;
	decompose(text_cps + idx, len, base, &base_len, marks, &marks_len);
	if (marks_len == 0) return (Step){.edit = pass_edit(), .pending = (Pending){0}};
	if (base_len == 0) return (Step){.edit = pass_edit(), .pending = (Pending){0}};
	if (is_combining_tie(marks[marks_len - 1])) {
		int32_t out[32]; int n = recompose(base, base_len, marks, marks_len - 1, out);
		return (Step){.edit = replace_cluster(len, out, n), .pending = (Pending){0}};
	}
	Pending p = {0};
	for (int i = 0; i < marks_len && i < PENDING_MAX; i++) p.items[p.count++] = marks[i];
	return (Step){.edit = replace_cluster(len, NULL, 0), .pending = p};
}

Step engine_handle_unconvert(const char *text_before, Pending pending) {
	if (pending.count > 0) return engine_handle_backspace(text_before, pending);
	int32_t text_cps[4096];
	int text_len = decode_utf8(text_before, text_cps, 4096);
	int len;
	int idx = last_cluster(text_cps, text_len, &len);
	if (idx >= 0) {
		int32_t whole[32]; int wn = recompose(text_cps + idx, len, NULL, 0, whole);
		if (wn == 0) { wn = len; memcpy(whole, text_cps + idx, (size_t)len * sizeof(int32_t)); }
		char whole_utf8[64]; encode_utf8(whole, wn, whole_utf8, sizeof(whole_utf8));
		int32_t low[32]; int low_n = 0;
		for (int i = 0; i < wn; i++) low[low_n++] = utf8proc_tolower(whole[i]);
		char low_utf8[64]; encode_utf8(low, low_n, low_utf8, sizeof(low_utf8));
		const char *key = strmap_get(&unconvert_key, low_utf8);
		if (key != NULL) {
			bool is_lower = strcmp(whole_utf8, low_utf8) == 0;
			if (is_lower) {
				int32_t cps[8]; int n = decode_utf8(key, cps, 8);
				return (Step){.edit = replace_cluster(len, cps, n), .pending = (Pending){0}};
			}
			int32_t cps[8]; int n = decode_utf8(key, cps, 8);
			for (int i = 0; i < n; i++) cps[i] = utf8proc_toupper(cps[i]);
			return (Step){.edit = replace_cluster(len, cps, n), .pending = (Pending){0}};
		}
	}
	return (Step){.edit = pass_edit(), .pending = (Pending){0}};
}

void engine_native_char(Keystroke k, char *out, size_t out_size) {
	if (strlen(k.key) != 1) { out[0] = '\0'; return; }
	char kc = k.key[0];
	if (k.shift && ((kc >= 'a' && kc <= 'z') || (kc >= 'A' && kc <= 'Z'))) {
		char up = (kc >= 'a' && kc <= 'z') ? (char)(kc - 'a' + 'A') : kc;
		out[0] = up; out[1] = '\0';
		return;
	}
	if (k.shift && kc >= '0' && kc <= '9') {
		const char *sd = shifted_digit(kc);
		snprintf(out, out_size, "%s", sd != NULL ? sd : "");
		return;
	}
	if (k.shift) {
		static const struct { char k; const char *v; } PUNCT[] = {
			{'`', "~"}, {'-', "_"}, {'=', "+"}, {'[', "{"}, {']', "}"}, {'\\', "|"},
			{';', ":"}, {'\'', "\""}, {',', "<"}, {'.', ">"}, {'/', "?"},
		};
		for (size_t i = 0; i < sizeof(PUNCT) / sizeof(PUNCT[0]); i++) {
			if (PUNCT[i].k == kc) { snprintf(out, out_size, "%s", PUNCT[i].v); return; }
		}
		out[0] = kc; out[1] = '\0';
		return;
	}
	if (k.option) { out[0] = '\0'; return; }
	out[0] = kc; out[1] = '\0';
}

int engine_last_cluster_byte_len(const char *text_before) {
	int32_t text_cps[4096];
	int text_len = decode_utf8(text_before, text_cps, 4096);
	int len;
	int idx = last_cluster(text_cps, text_len, &len);
	if (idx < 0) return 0;
	char buf[64];
	encode_utf8(text_cps + idx, len, buf, sizeof(buf));
	return (int)strlen(buf);
}

void engine_apply_edit(const char *text_before, Edit edit, const char *native, char *out, size_t out_size) {
	int32_t text_cps[4096];
	int text_len = decode_utf8(text_before, text_cps, 4096);
	int32_t result[4096];
	int result_len = 0;
	switch (edit.type) {
		case EDIT_INSERT:
			memcpy(result, text_cps, (size_t)text_len * sizeof(int32_t));
			result_len = text_len;
			memcpy(result + result_len, edit.text, (size_t)edit.text_len * sizeof(int32_t));
			result_len += edit.text_len;
			break;
		case EDIT_REPLACE:
			memcpy(result, text_cps, (size_t)(text_len - edit.replace_len) * sizeof(int32_t));
			result_len = text_len - edit.replace_len;
			memcpy(result + result_len, edit.text, (size_t)edit.text_len * sizeof(int32_t));
			result_len += edit.text_len;
			break;
		case EDIT_PASS: {
			memcpy(result, text_cps, (size_t)text_len * sizeof(int32_t));
			result_len = text_len;
			int32_t native_cps[8]; int nn = decode_utf8(native, native_cps, 8);
			memcpy(result + result_len, native_cps, (size_t)nn * sizeof(int32_t));
			result_len += nn;
			break;
		}
		case EDIT_NOOP:
			memcpy(result, text_cps, (size_t)text_len * sizeof(int32_t));
			result_len = text_len;
			break;
	}
	encode_utf8(result, result_len, out, out_size);
}
