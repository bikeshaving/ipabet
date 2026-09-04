// The IBus side of IPAbet: it owns no phonetics of its own. Every decision
// about what a keystroke means comes back from the Rust engine in engine/ (the
// same crate the fcitx5 addon and the Windows text service link), reached
// through its C ABI.
//
// IBus rather than fcitx5 for the shipped package, because IBus is what GNOME,
// Ubuntu and Fedora already run. A user installs the package, logs in, and
// picks IPAbet from the input menu already in their top bar — no framework to
// replace first.
//
// Composition model: the trailing run lives in the preedit. The engine looks
// back at most two grapheme clusters, so that is all the preedit ever holds —
// everything older is committed as soon as the engine can no longer reach it.

#include <ibus.h>

#include <stdlib.h>
#include <string.h>

#include "ipabet_engine.h"
#include "uslayout.h"

#define IPABET_TYPE_IBUS_ENGINE (ipabet_ibus_engine_get_type())

typedef struct {
    IBusEngine parent;

    CPending pending;
    gboolean chain_broken;
    /// The tail of the run not yet committed to the client — what the engine
    /// sees as text_before, and what the preedit shows.
    GString *buffer;
    /// A ⇧ release between two keystrokes breaks the chain, which is what stops
    /// an acronym from rebasing into IPA.
    gboolean shift_down;
    gboolean shift_broke;
} IpabetIBusEngine;

typedef struct {
    IBusEngineClass parent;
} IpabetIBusEngineClass;

G_DEFINE_TYPE(IpabetIBusEngine, ipabet_ibus_engine, IBUS_TYPE_ENGINE)

static Engine *g_transform = NULL;

// --- helpers ---------------------------------------------------------------

static void ipabet_reset_state(IpabetIBusEngine *self) {
    memset(&self->pending, 0, sizeof(self->pending));
    self->chain_broken = FALSE;
    g_string_set_size(self->buffer, 0);
}

static void ipabet_update_preedit(IpabetIBusEngine *self) {
    char preview[EDIT_TEXT_MAX];
    ipabet_preview_string(g_transform, self->pending, preview, sizeof(preview));

    GString *shown = g_string_new(self->buffer->str);
    g_string_append(shown, preview);

    if (shown->len == 0) {
        ibus_engine_hide_preedit_text((IBusEngine *)self);
    } else {
        IBusText *text = ibus_text_new_from_string(shown->str);
        ibus_text_append_attribute(text, IBUS_ATTR_TYPE_UNDERLINE, IBUS_ATTR_UNDERLINE_SINGLE, 0,
                                   -1);
        ibus_engine_update_preedit_text((IBusEngine *)self, text,
                                        g_utf8_strlen(shown->str, -1), TRUE);
    }
    g_string_free(shown, TRUE);
}

/// Hand the client everything held and stop composing — the boundary behaviour
/// for a key IPAbet declines, and for losing focus.
static void ipabet_flush(IpabetIBusEngine *self) {
    // An armed diacritic that never found a base commits as its spacing clone,
    // which is exactly what the engine's commit string is.
    char tail[EDIT_TEXT_MAX];
    ipabet_commit_string(g_transform, self->pending, tail, sizeof(tail));

    GString *out = g_string_new(self->buffer->str);
    g_string_append(out, tail);
    ipabet_reset_state(self);
    ibus_engine_hide_preedit_text((IBusEngine *)self);
    if (out->len > 0) {
        ibus_engine_commit_text((IBusEngine *)self, ibus_text_new_from_string(out->str));
    }
    g_string_free(out, TRUE);
}

/// Commit everything the engine can no longer reach, so the underlined region
/// stays a glyph or two rather than growing to the whole word.
static void ipabet_trim(IpabetIBusEngine *self) {
    size_t last = ipabet_last_cluster_byte_len(self->buffer->str);
    if (last == 0 || last > self->buffer->len) return;

    char *head = g_strndup(self->buffer->str, self->buffer->len - last);
    size_t keep = last + ipabet_last_cluster_byte_len(head);
    g_free(head);
    if (self->buffer->len <= keep) return;

    size_t commit_len = self->buffer->len - keep;
    char *commit = g_strndup(self->buffer->str, commit_len);
    ibus_engine_commit_text((IBusEngine *)self, ibus_text_new_from_string(commit));
    g_free(commit);
    g_string_erase(self->buffer, 0, commit_len);
}

/// Drop the last `count` codepoints from the buffer.
static void ipabet_truncate_codepoints(GString *s, int count) {
    const char *start = s->str;
    const char *end = s->str + s->len;
    for (int i = 0; i < count && end > start; i++) {
        end = g_utf8_prev_char(end);
    }
    g_string_set_size(s, (size_t)(end - start));
}

// --- the key path ----------------------------------------------------------

/// A modifier key pressed on its own. It is not a keystroke IPAbet declines —
/// it is not a keystroke at all, and treating it as one ends the run, which
/// throws away an armed diacritic every time ⌥ goes down.
static gboolean ipabet_is_modifier(guint keyval) {
    switch (keyval) {
    case IBUS_KEY_Shift_L:
    case IBUS_KEY_Shift_R:
    case IBUS_KEY_Control_L:
    case IBUS_KEY_Control_R:
    case IBUS_KEY_Alt_L:
    case IBUS_KEY_Alt_R:
    case IBUS_KEY_Meta_L:
    case IBUS_KEY_Meta_R:
    case IBUS_KEY_Super_L:
    case IBUS_KEY_Super_R:
    case IBUS_KEY_Hyper_L:
    case IBUS_KEY_Hyper_R:
    case IBUS_KEY_Caps_Lock:
    case IBUS_KEY_Shift_Lock:
    case IBUS_KEY_Num_Lock:
    case IBUS_KEY_ISO_Level3_Shift:
    case IBUS_KEY_ISO_Level5_Shift:
    case IBUS_KEY_Mode_switch:
        return TRUE;
    default:
        return FALSE;
    }
}

static gboolean ipabet_process_key_event(IBusEngine *engine, guint keyval, guint keycode,
                                         guint state) {
    IpabetIBusEngine *self = (IpabetIBusEngine *)engine;
    if (!g_transform) return FALSE;

    const gboolean is_shift = keyval == IBUS_KEY_Shift_L || keyval == IBUS_KEY_Shift_R;

    if (state & IBUS_RELEASE_MASK) {
        if (is_shift && self->shift_down) {
            self->shift_broke = TRUE;
            self->shift_down = FALSE;
        }
        return FALSE;
    }
    if (is_shift) {
        self->shift_down = TRUE;
        return FALSE;
    }
    if (ipabet_is_modifier(keyval)) {
        return FALSE;
    }

    // Super chords are the desktop's, never ours. So is AltGr: on a layout that
    // has one, that is how the user reaches @ and €, and claiming the key would
    // hand them the US letter underneath it instead.
    if ((state & IBUS_SUPER_MASK) || (state & IBUS_MOD5_MASK)) {
        ipabet_flush(self);
        return FALSE;
    }

    // IBus reports the evdev code; the table is keyed by X11 keycodes, which
    // are the same numbers plus eight.
    const char *label = "";
    if (keyval == IBUS_KEY_Escape) {
        label = "Escape";
    } else if (keyval != IBUS_KEY_BackSpace) {
        label = ipabet_us_layout_label(keycode + 8);
        if (label[0] == '\0') {
            // Arrows, Return, Tab, anything off the claimed plane: the run ends
            // here and the client gets the key untouched.
            ipabet_flush(self);
            return FALSE;
        }
    }

    CKeystroke k;
    memset(&k, 0, sizeof(k));
    k.key = label;
    k.shift = (state & IBUS_SHIFT_MASK) != 0;
    k.option = (state & IBUS_MOD1_MASK) != 0;
    k.control = (state & IBUS_CONTROL_MASK) != 0;
    k.caps_lock = (state & IBUS_LOCK_MASK) != 0;
    k.shift_broke = self->shift_broke;
    self->shift_broke = FALSE;

    CStep step;
    if (keyval == IBUS_KEY_BackSpace) {
        // ⌃⌫ unconverts the glyph before the cursor back to its keystroke
        // spelling; a plain ⌫ peels a pending mark, then deletes.
        step = k.control ? ipabet_engine_handle_unconvert(g_transform, self->buffer->str,
                                                          self->pending)
                         : ipabet_engine_handle_backspace(g_transform, self->buffer->str,
                                                          self->pending);
    } else {
        step = ipabet_engine_handle_key(g_transform, self->buffer->str, k, self->pending,
                                        self->chain_broken);
    }

    if (step.edit.edit_type == Pass) {
        // Pass means the host puts the key's own character in the document.
        // Where the document can be read back that is the end of it, but here
        // the buffer is the only record of the run, so a printable key keeps
        // composing with its native character appended — drop it and the digit
        // in 5,⇧H is gone by the time ⇧H asks what preceded it. The keys that
        // genuinely end a run still go to the client.
        char native[EDIT_TEXT_MAX];
        ipabet_native_char(k, native, sizeof(native));
        const gboolean ends_run =
            keyval == IBUS_KEY_BackSpace || keyval == IBUS_KEY_Escape || k.control;
        if (ends_run || native[0] == '\0') {
            ipabet_flush(self);
            return FALSE;
        }
        g_string_append(self->buffer, native);
    }

    self->pending = step.pending;
    if (step.has_chain_broken) self->chain_broken = step.chain_broken;

    switch (step.edit.edit_type) {
    case Insert:
        g_string_append(self->buffer, step.edit.text);
        break;
    case Replace:
        ipabet_truncate_codepoints(self->buffer, step.edit.replace_length);
        g_string_append(self->buffer, step.edit.text);
        break;
    default: // Noop, and Pass whose native character is already appended
        break;
    }

    ipabet_trim(self);
    ipabet_update_preedit(self);
    return TRUE;
}

static void ipabet_ibus_engine_reset_cb(IBusEngine *engine) {
    ipabet_flush((IpabetIBusEngine *)engine);
}

static void ipabet_ibus_engine_focus_out(IBusEngine *engine) {
    // Focus moved: an armed diacritic does not carry across documents.
    ipabet_flush((IpabetIBusEngine *)engine);
}

static void ipabet_ibus_engine_init(IpabetIBusEngine *self) {
    self->buffer = g_string_new("");
    ipabet_reset_state(self);
    self->shift_down = FALSE;
    self->shift_broke = FALSE;
}

static void ipabet_ibus_engine_destroy(IBusEngine *engine) {
    IpabetIBusEngine *self = (IpabetIBusEngine *)engine;
    if (self->buffer) {
        g_string_free(self->buffer, TRUE);
        self->buffer = NULL;
    }
    IBUS_OBJECT_CLASS(ipabet_ibus_engine_parent_class)->destroy((IBusObject *)engine);
}

static void ipabet_ibus_engine_class_init(IpabetIBusEngineClass *klass) {
    IBusEngineClass *engine_class = IBUS_ENGINE_CLASS(klass);
    engine_class->process_key_event = ipabet_process_key_event;
    engine_class->reset = ipabet_ibus_engine_reset_cb;
    engine_class->focus_out = ipabet_ibus_engine_focus_out;
    IBUS_OBJECT_CLASS(klass)->destroy = ipabet_ibus_engine_destroy;
}

// --- process ---------------------------------------------------------------

/// spec/ipabet.json as installed. The tables are data on every platform and are
/// never transcribed into code.
static char *read_spec(void) {
    char *contents = NULL;
    gsize len = 0;
    const char *paths[] = {"/usr/share/ipabet/ipabet.json", IPABET_SPEC_FALLBACK};
    for (guint i = 0; i < G_N_ELEMENTS(paths); i++) {
        if (g_file_get_contents(paths[i], &contents, &len, NULL)) return contents;
    }
    return NULL;
}

int main(int argc, char **argv) {
    // Before anything else runs: give up network sockets for good. An input
    // method sees every keystroke; "it cannot phone home" is enforced by the
    // kernel from here on, not promised. Refusing to start without the
    // filter is deliberate — a silent fallback would quietly void the claim.
    if (!ipabet_lockdown_network()) {
        g_printerr("ipabet: could not install the no-network seccomp filter\n");
        return 1;
    }

    ibus_init();

    char *spec = read_spec();
    if (!spec) {
        g_printerr("ipabet: cannot read ipabet.json — the install is incomplete\n");
        return 1;
    }
    g_transform = ipabet_engine_new(spec);
    g_free(spec);
    if (!g_transform) {
        g_printerr("ipabet: the spec did not parse\n");
        return 1;
    }

    IBusBus *bus = ibus_bus_new();
    g_object_ref_sink(bus);
    if (!ibus_bus_is_connected(bus)) {
        g_printerr("ipabet: no ibus daemon to connect to\n");
        return 1;
    }

    IBusFactory *factory = ibus_factory_new(ibus_bus_get_connection(bus));
    g_object_ref_sink(factory);
    ibus_factory_add_engine(factory, "ipabet", IPABET_TYPE_IBUS_ENGINE);

    // --ibus means the daemon launched us and owns our lifetime; without it we
    // were started by hand and have to claim the bus name ourselves.
    gboolean by_daemon = argc > 1 && g_strcmp0(argv[1], "--ibus") == 0;
    if (by_daemon) {
        ibus_bus_request_name(bus, "org.freedesktop.IBus.IPAbet", 0);
    } else {
        IBusComponent *component =
            ibus_component_new("org.freedesktop.IBus.IPAbet", "IPAbet", IPABET_VERSION, "MIT",
                               "Brian Kim", "https://ipabet.org", "", "ipabet");
        IBusEngineDesc *desc = ibus_engine_desc_new(
            "ipabet", "IPAbet", "Type the International Phonetic Alphabet", "", "MIT", "Brian Kim",
            "ipabet", "us");
        ibus_component_add_engine(component, desc);
        ibus_bus_register_component(bus, component);
    }

    ibus_main();
    return 0;
}
