// Replays spec/parity-vectors.json through the C engine directly — no
// fcitx5, no VM, sub-second run. Mirrors js/src/index.ts's typeKeys() loop
// exactly (including its "⌫" backspace-sentinel handling and the
// still-pending-commits-as-spacing-form tail), since the vectors were
// recorded through that exact function.

#include "../src/engine.h"
#include "../src/json.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static Keystroke keystroke_from_json(const JsonValue *e, char *key_buf, size_t key_buf_size) {
	snprintf(key_buf, key_buf_size, "%s", json_str(json_get(e, "key")));
	Keystroke k = {0};
	k.key = key_buf;
	k.shift = json_bool(json_get(e, "shift")) != 0;
	k.option = json_bool(json_get(e, "option")) != 0;
	k.shift_broke = json_bool(json_get(e, "shiftBroke")) != 0;
	k.caps_lock = json_bool(json_get(e, "capsLock")) != 0;
	k.control = json_bool(json_get(e, "control")) != 0;
	return k;
}

// Deletes the last grapheme cluster from `text` in place (native backspace,
// the host's job when the engine declines) — mirrors typeKeys' own
// lastCluster-based simulation exactly.
static void delete_last_cluster(char *text) {
	int len = engine_last_cluster_byte_len(text);
	if (len == 0) return;
	size_t total = strlen(text);
	text[total - (size_t)len] = '\0';
}

// Replays one vector's keystrokes, mirroring typeKeys() exactly.
static void replay(const JsonValue *keys_arr, const char *initial, char *text, size_t text_cap) {
	snprintf(text, text_cap, "%s", initial);
	Pending pending = {0};
	bool chain_broken = false;
	char key_buf[16];
	for (size_t i = 0; i < keys_arr->as.array.count; i++) {
		const JsonValue *e = keys_arr->as.array.items[i];
		Keystroke k = keystroke_from_json(e, key_buf, sizeof(key_buf));
		bool is_backspace = strcmp(k.key, "\xE2\x8C\xAB") == 0; // ⌫ (U+232B), UTF-8
		Step step;
		if (is_backspace) {
			step = k.control ? engine_handle_unconvert(text, pending) : engine_handle_backspace(text, pending);
		} else {
			step = engine_handle_key(text, k, pending, chain_broken);
		}
		pending = step.pending;
		chain_broken = step.has_chain_broken ? step.chain_broken : false;
		if (is_backspace && step.edit.type == EDIT_PASS) {
			if (!k.control) delete_last_cluster(text);
		} else {
			char native[8] = {0};
			if (step.edit.type == EDIT_PASS) engine_native_char(k, native, sizeof(native));
			char out[4096];
			engine_apply_edit(text, step.edit, native, out, sizeof(out));
			snprintf(text, text_cap, "%s", out);
		}
	}
	if (pending.count > 0) {
		char commit[64];
		engine_commit_string(pending, commit, sizeof(commit));
		strncat(text, commit, text_cap - strlen(text) - 1);
	}
}

int main(int argc, char **argv) {
	const char *spec_path = argc > 1 ? argv[1] : "../../spec/ipabet.json";
	const char *vectors_path = argc > 2 ? argv[2] : "../../spec/parity-vectors.json";

	if (!engine_init(spec_path)) {
		fprintf(stderr, "failed to load %s\n", spec_path);
		return 1;
	}
	JsonValue *vectors = json_parse_file(vectors_path);
	if (vectors == NULL || vectors->type != JSON_ARRAY) {
		fprintf(stderr, "failed to load %s\n", vectors_path);
		return 1;
	}

	int pass = 0, fail = 0;
	int max_print = 40;
	for (size_t i = 0; i < vectors->as.array.count; i++) {
		const JsonValue *v = vectors->as.array.items[i];
		const char *initial = json_str(json_get(v, "initial"));
		const char *expected = json_str(json_get(v, "expected"));
		const char *locale = json_str(json_get(v, "locale"));
		engine_set_quote_locale(locale[0] != '\0' ? locale : "en");
		engine_set_capital_digraphs(json_bool(json_get(v, "capital_digraphs")) != 0);
		const JsonValue *keys_arr = json_get(v, "keys");
		char text[4096];
		replay(keys_arr, initial, text, sizeof(text));
		if (strcmp(text, expected) == 0) {
			pass++;
		} else {
			fail++;
			if (max_print > 0) {
				max_print--;
				printf("FAIL #%zu: got [%s] want [%s] locale=%s initial=[%s] keys=", i, text, expected, locale, initial);
				for (size_t j = 0; j < keys_arr->as.array.count; j++) {
					const JsonValue *e = keys_arr->as.array.items[j];
					printf("{%s%s%s%s%s%s} ", json_str(json_get(e, "key")),
						json_bool(json_get(e, "shift")) ? "+shift" : "",
						json_bool(json_get(e, "option")) ? "+opt" : "",
						json_bool(json_get(e, "control")) ? "+ctrl" : "",
						json_bool(json_get(e, "capsLock")) ? "+caps" : "",
						json_bool(json_get(e, "shiftBroke")) ? "+broke" : "");
				}
				printf("\n");
			}
		}
	}

	printf("\n%d pass, %d fail, %d total\n", pass, fail, pass + fail);
	json_free(vectors);
	engine_shutdown();
	return fail > 0 ? 1 : 0;
}
