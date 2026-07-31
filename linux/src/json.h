// A small first-party JSON reader — just enough to parse spec/ipabet.json's
// shape (objects, arrays, strings with standard escapes, booleans, numbers).
// Not a general-purpose library: no streaming, no comments, no big-number
// handling. Values are held in one arena, freed together via json_free.
#ifndef IPABET_JSON_H
#define IPABET_JSON_H

#include <stddef.h>

typedef enum {
	JSON_NULL,
	JSON_BOOL,
	JSON_NUMBER,
	JSON_STRING,
	JSON_ARRAY,
	JSON_OBJECT,
} JsonType;

typedef struct JsonValue JsonValue;

struct JsonValue {
	JsonType type;
	union {
		int boolean;
		double number;
		char *string; // NUL-terminated UTF-8
		struct {
			JsonValue **items;
			size_t count;
		} array;
		struct {
			char **keys;      // NUL-terminated UTF-8
			JsonValue **values;
			size_t count;
		} object;
	} as;
};

// Parses `text` (NUL-terminated UTF-8). Returns NULL on malformed input.
JsonValue *json_parse(const char *text);

// Parses the file at `path` in full. Returns NULL if the file can't be read
// or parsed.
JsonValue *json_parse_file(const char *path);

void json_free(JsonValue *v);

// Convenience accessors. All return NULL/0 on a type or key mismatch instead
// of aborting — callers check for NULL, matching the JS engine's `?? ""`-style
// defaulting instead of the JS engine's exceptions (this table data is a build
// artifact of the spec, not untrusted input, so a malformed table is a build
// bug to surface via a loud failure at the call site, not here).
const JsonValue *json_get(const JsonValue *obj, const char *key);
const char *json_str(const JsonValue *v); // "" if not a string
int json_bool(const JsonValue *v);        // 0 if not a bool/not true

#endif
