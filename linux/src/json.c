#include "json.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
	const char *p;
} Parser;

static void skip_ws(Parser *ps) {
	while (*ps->p == ' ' || *ps->p == '\t' || *ps->p == '\n' || *ps->p == '\r') ps->p++;
}

static JsonValue *new_value(JsonType t) {
	JsonValue *v = calloc(1, sizeof(JsonValue));
	v->type = t;
	return v;
}

static JsonValue *parse_value(Parser *ps);

// Encodes `cp` as UTF-8 into `out`, returning the number of bytes written.
static int encode_utf8(unsigned int cp, char *out) {
	if (cp <= 0x7F) {
		out[0] = (char)cp;
		return 1;
	} else if (cp <= 0x7FF) {
		out[0] = (char)(0xC0 | (cp >> 6));
		out[1] = (char)(0x80 | (cp & 0x3F));
		return 2;
	} else if (cp <= 0xFFFF) {
		out[0] = (char)(0xE0 | (cp >> 12));
		out[1] = (char)(0x80 | ((cp >> 6) & 0x3F));
		out[2] = (char)(0x80 | (cp & 0x3F));
		return 3;
	} else {
		out[0] = (char)(0xF0 | (cp >> 18));
		out[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
		out[2] = (char)(0x80 | ((cp >> 6) & 0x3F));
		out[3] = (char)(0x80 | (cp & 0x3F));
		return 4;
	}
}

static unsigned int hex4(const char *p) {
	unsigned int v = 0;
	for (int i = 0; i < 4; i++) {
		char c = p[i];
		v <<= 4;
		if (c >= '0' && c <= '9') v |= (unsigned)(c - '0');
		else if (c >= 'a' && c <= 'f') v |= (unsigned)(c - 'a' + 10);
		else if (c >= 'A' && c <= 'F') v |= (unsigned)(c - 'A' + 10);
	}
	return v;
}

// Parses a JSON string literal (opening quote already consumed by the caller
// having positioned ps->p AT the opening quote). Returns a malloc'd, decoded,
// NUL-terminated UTF-8 string, or NULL on malformed input.
static char *parse_string_raw(Parser *ps) {
	if (*ps->p != '"') return NULL;
	ps->p++;
	// Worst case every input byte becomes at most 4 output bytes (a \uXXXX
	// escape decoding to a 4-byte UTF-8 sequence) — oversize once, trim never.
	size_t cap = 64;
	char *buf = malloc(cap);
	size_t len = 0;
	while (*ps->p != '"') {
		if (*ps->p == '\0') { free(buf); return NULL; }
		if (len + 4 >= cap) { cap *= 2; buf = realloc(buf, cap); }
		if (*ps->p == '\\') {
			ps->p++;
			switch (*ps->p) {
				case '"': buf[len++] = '"'; ps->p++; break;
				case '\\': buf[len++] = '\\'; ps->p++; break;
				case '/': buf[len++] = '/'; ps->p++; break;
				case 'b': buf[len++] = '\b'; ps->p++; break;
				case 'f': buf[len++] = '\f'; ps->p++; break;
				case 'n': buf[len++] = '\n'; ps->p++; break;
				case 'r': buf[len++] = '\r'; ps->p++; break;
				case 't': buf[len++] = '\t'; ps->p++; break;
				case 'u': {
					ps->p++;
					unsigned int cp = hex4(ps->p);
					ps->p += 4;
					// A surrogate pair: combine before encoding.
					if (cp >= 0xD800 && cp <= 0xDBFF && ps->p[0] == '\\' && ps->p[1] == 'u') {
						unsigned int lo = hex4(ps->p + 2);
						if (lo >= 0xDC00 && lo <= 0xDFFF) {
							cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
							ps->p += 6;
						}
					}
					len += (size_t)encode_utf8(cp, buf + len);
					break;
				}
				default: free(buf); return NULL;
			}
		} else {
			buf[len++] = *ps->p++;
		}
	}
	ps->p++; // closing quote
	buf[len] = '\0';
	return buf;
}

static JsonValue *parse_string(Parser *ps) {
	char *s = parse_string_raw(ps);
	if (s == NULL) return NULL;
	JsonValue *v = new_value(JSON_STRING);
	v->as.string = s;
	return v;
}

static JsonValue *parse_number(Parser *ps) {
	const char *start = ps->p;
	if (*ps->p == '-') ps->p++;
	while (isdigit((unsigned char)*ps->p)) ps->p++;
	if (*ps->p == '.') { ps->p++; while (isdigit((unsigned char)*ps->p)) ps->p++; }
	if (*ps->p == 'e' || *ps->p == 'E') {
		ps->p++;
		if (*ps->p == '+' || *ps->p == '-') ps->p++;
		while (isdigit((unsigned char)*ps->p)) ps->p++;
	}
	JsonValue *v = new_value(JSON_NUMBER);
	v->as.number = strtod(start, NULL);
	return v;
}

static JsonValue *parse_array(Parser *ps) {
	ps->p++; // '['
	JsonValue *v = new_value(JSON_ARRAY);
	size_t cap = 8;
	v->as.array.items = malloc(cap * sizeof(JsonValue *));
	v->as.array.count = 0;
	skip_ws(ps);
	if (*ps->p == ']') { ps->p++; return v; }
	while (1) {
		skip_ws(ps);
		JsonValue *item = parse_value(ps);
		if (item == NULL) { json_free(v); return NULL; }
		if (v->as.array.count == cap) { cap *= 2; v->as.array.items = realloc(v->as.array.items, cap * sizeof(JsonValue *)); }
		v->as.array.items[v->as.array.count++] = item;
		skip_ws(ps);
		if (*ps->p == ',') { ps->p++; continue; }
		if (*ps->p == ']') { ps->p++; break; }
		json_free(v);
		return NULL;
	}
	return v;
}

static JsonValue *parse_object(Parser *ps) {
	ps->p++; // '{'
	JsonValue *v = new_value(JSON_OBJECT);
	size_t cap = 8;
	v->as.object.keys = malloc(cap * sizeof(char *));
	v->as.object.values = malloc(cap * sizeof(JsonValue *));
	v->as.object.count = 0;
	skip_ws(ps);
	if (*ps->p == '}') { ps->p++; return v; }
	while (1) {
		skip_ws(ps);
		char *key = parse_string_raw(ps);
		if (key == NULL) { json_free(v); return NULL; }
		skip_ws(ps);
		if (*ps->p != ':') { free(key); json_free(v); return NULL; }
		ps->p++;
		skip_ws(ps);
		JsonValue *val = parse_value(ps);
		if (val == NULL) { free(key); json_free(v); return NULL; }
		if (v->as.object.count == cap) {
			cap *= 2;
			v->as.object.keys = realloc(v->as.object.keys, cap * sizeof(char *));
			v->as.object.values = realloc(v->as.object.values, cap * sizeof(JsonValue *));
		}
		v->as.object.keys[v->as.object.count] = key;
		v->as.object.values[v->as.object.count] = val;
		v->as.object.count++;
		skip_ws(ps);
		if (*ps->p == ',') { ps->p++; continue; }
		if (*ps->p == '}') { ps->p++; break; }
		json_free(v);
		return NULL;
	}
	return v;
}

static JsonValue *parse_value(Parser *ps) {
	skip_ws(ps);
	switch (*ps->p) {
		case '"': return parse_string(ps);
		case '{': return parse_object(ps);
		case '[': return parse_array(ps);
		case 't':
			if (strncmp(ps->p, "true", 4) == 0) {
				ps->p += 4;
				JsonValue *v = new_value(JSON_BOOL);
				v->as.boolean = 1;
				return v;
			}
			return NULL;
		case 'f':
			if (strncmp(ps->p, "false", 5) == 0) {
				ps->p += 5;
				JsonValue *v = new_value(JSON_BOOL);
				v->as.boolean = 0;
				return v;
			}
			return NULL;
		case 'n':
			if (strncmp(ps->p, "null", 4) == 0) {
				ps->p += 4;
				return new_value(JSON_NULL);
			}
			return NULL;
		default:
			if (*ps->p == '-' || isdigit((unsigned char)*ps->p)) return parse_number(ps);
			return NULL;
	}
}

JsonValue *json_parse(const char *text) {
	Parser ps = {.p = text};
	JsonValue *v = parse_value(&ps);
	if (v == NULL) return NULL;
	skip_ws(&ps);
	if (*ps.p != '\0') { json_free(v); return NULL; }
	return v;
}

JsonValue *json_parse_file(const char *path) {
	FILE *f = fopen(path, "rb");
	if (f == NULL) return NULL;
	fseek(f, 0, SEEK_END);
	long size = ftell(f);
	fseek(f, 0, SEEK_SET);
	if (size < 0) { fclose(f); return NULL; }
	char *buf = malloc((size_t)size + 1);
	size_t n = fread(buf, 1, (size_t)size, f);
	fclose(f);
	buf[n] = '\0';
	JsonValue *v = json_parse(buf);
	free(buf);
	return v;
}

void json_free(JsonValue *v) {
	if (v == NULL) return;
	switch (v->type) {
		case JSON_STRING:
			free(v->as.string);
			break;
		case JSON_ARRAY:
			for (size_t i = 0; i < v->as.array.count; i++) json_free(v->as.array.items[i]);
			free(v->as.array.items);
			break;
		case JSON_OBJECT:
			for (size_t i = 0; i < v->as.object.count; i++) {
				free(v->as.object.keys[i]);
				json_free(v->as.object.values[i]);
			}
			free(v->as.object.keys);
			free(v->as.object.values);
			break;
		default:
			break;
	}
	free(v);
}

const JsonValue *json_get(const JsonValue *obj, const char *key) {
	if (obj == NULL || obj->type != JSON_OBJECT) return NULL;
	for (size_t i = 0; i < obj->as.object.count; i++) {
		if (strcmp(obj->as.object.keys[i], key) == 0) return obj->as.object.values[i];
	}
	return NULL;
}

const char *json_str(const JsonValue *v) {
	if (v == NULL || v->type != JSON_STRING) return "";
	return v->as.string;
}

int json_bool(const JsonValue *v) {
	if (v == NULL || v->type != JSON_BOOL) return 0;
	return v->as.boolean;
}
