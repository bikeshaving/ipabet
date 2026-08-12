// The fcitx5 side of IPAbet: it owns no phonetics of its own. Every decision
// about what a keystroke means comes back from the Rust engine in engine/
// (the same crate the Windows port links), reached through
// its C ABI; this file only translates fcitx5's key events into the engine's
// Keystroke shape and turns the Edit it hands back into client text.
//
// Composition model: the trailing run lives in the preedit rather than being
// committed straight into the document. The engine looks back at most two
// clusters, so that is all the preedit ever holds — everything older is
// committed as soon as the engine can no longer reach it. That keeps the
// underlined region down to a character or two while needing nothing from the
// client beyond preedit support, which every fcitx5 frontend has; reading and
// rewriting already-committed text would need the surrounding-text capability,
// which plenty of clients (terminals especially) do not offer.

#include "ipabet.h"
#include "uslayout.h"

#include <fcitx-utils/standardpath.h>
#include <fcitx-utils/utf8.h>
#include <fcitx/inputcontext.h>
#include <fcitx/inputpanel.h>
#include <fcitx/text.h>

#include <fstream>
#include <sstream>

namespace ipabet {

namespace {

/// Drop the last `count` codepoints from a UTF-8 string.
void truncateCodepoints(std::string &s, int count) {
    size_t end = s.size();
    for (int i = 0; i < count && end > 0; i++) {
        size_t start = end - 1;
        while (start > 0 && (static_cast<unsigned char>(s[start]) & 0xC0) == 0x80) {
            start--;
        }
        end = start;
    }
    s.resize(end);
}

std::string readSpec() {
    // Installed layout first; the build tree's copy is the fallback so the
    // addon can be run straight out of a build directory during development.
    std::string path =
        fcitx::StandardPath::global().locate(fcitx::StandardPath::Type::PkgData, "ipabet/ipabet.json");
    if (path.empty()) {
        path = IPABET_SPEC_FALLBACK;
    }
    std::ifstream in(path);
    if (!in) {
        return {};
    }
    std::ostringstream buf;
    buf << in.rdbuf();
    return buf.str();
}

} // namespace

IpabetEngine::IpabetEngine(fcitx::Instance *instance)
    : instance_(instance), factory_([](fcitx::InputContext &) { return new IpabetState; }) {
    const std::string spec = readSpec();
    if (!spec.empty()) {
        engine_ = ipabet_engine_new(spec.c_str());
    }
    instance_->inputContextManager().registerProperty("ipabetState", &factory_);
}

IpabetEngine::~IpabetEngine() {
    if (engine_) {
        ipabet_engine_free(engine_);
    }
}

void IpabetEngine::flush(fcitx::InputContext *ic, IpabetState *state) {
    // An armed diacritic that never found a base commits as its spacing clone,
    // which is exactly what the engine's commit string is.
    char tail[EDIT_TEXT_MAX];
    ipabet_commit_string(engine_, state->pending, tail, sizeof(tail));
    const std::string text = state->buffer + tail;
    state->clear();
    ic->inputPanel().reset();
    ic->updatePreedit();
    if (!text.empty()) {
        ic->commitString(text);
    }
}

void IpabetEngine::trim(fcitx::InputContext *ic, IpabetState *state) {
    const size_t last = ipabet_last_cluster_byte_len(state->buffer.c_str());
    const std::string head = state->buffer.substr(0, state->buffer.size() - last);
    const size_t keep = last + ipabet_last_cluster_byte_len(head.c_str());
    if (state->buffer.size() <= keep) {
        return;
    }
    ic->commitString(state->buffer.substr(0, state->buffer.size() - keep));
    state->buffer = state->buffer.substr(state->buffer.size() - keep);
}

void IpabetEngine::updatePreedit(fcitx::InputContext *ic, IpabetState *state) {
    char preview[EDIT_TEXT_MAX];
    ipabet_preview_string(engine_, state->pending, preview, sizeof(preview));
    const std::string text = state->buffer + preview;

    fcitx::Text preedit;
    preedit.append(text, fcitx::TextFormatFlag::Underline);
    preedit.setCursor(static_cast<int>(text.size()));
    if (ic->capabilityFlags().test(fcitx::CapabilityFlag::Preedit)) {
        ic->inputPanel().setClientPreedit(preedit);
    } else {
        ic->inputPanel().setPreedit(preedit);
    }
    ic->updatePreedit();
    ic->updateUserInterface(fcitx::UserInterfaceComponent::InputPanel);
}

void IpabetEngine::reset(const fcitx::InputMethodEntry &, fcitx::InputContextEvent &event) {
    auto *ic = event.inputContext();
    auto *state = ic->propertyFor(&factory_);
    if (engine_) {
        flush(ic, state);
    } else {
        state->clear();
    }
    shiftDown_ = false;
    shiftBroke_ = false;
}

void IpabetEngine::keyEvent(const fcitx::InputMethodEntry &, fcitx::KeyEvent &event) {
    // A spec that failed to load is a packaging bug, not a runtime state to
    // recover from — decline everything rather than eat the user's keystrokes.
    if (!engine_) {
        return;
    }

    const fcitx::Key raw = event.rawKey();
    const auto sym = raw.sym();

    // ⇧ tracked across events, never consumed: a release between two
    // keystrokes is what breaks the chain.
    const bool isShiftKey = sym == FcitxKey_Shift_L || sym == FcitxKey_Shift_R;
    if (event.isRelease()) {
        if (isShiftKey && shiftDown_) {
            shiftBroke_ = true;
            shiftDown_ = false;
        }
        return;
    }
    if (isShiftKey) {
        shiftDown_ = true;
        return;
    }
    if (raw.isModifier()) {
        return;
    }

    auto *ic = event.inputContext();
    auto *state = ic->propertyFor(&factory_);
    const fcitx::KeyStates states = raw.states();

    // Super chords are the desktop's, never ours. So is AltGr: on a layout that
    // has one, that is how the user reaches @ and €, and claiming the key would
    // hand them the US letter underneath it instead.
    if (states.test(fcitx::KeyState::Super) || states.test(fcitx::KeyState::Mod5)) {
        flush(ic, state);
        return;
    }

    std::string label;
    if (sym == FcitxKey_Escape) {
        label = "Escape";
    } else if (sym != FcitxKey_BackSpace) {
        label = usLayoutLabel(raw.code());
        if (label.empty()) {
            // Arrows, Return, Tab, anything off the claimed plane: the run
            // ends here and the client gets the key untouched.
            flush(ic, state);
            return;
        }
    }

    CKeystroke k{};
    k.key = label.c_str();
    k.shift = states.test(fcitx::KeyState::Shift);
    k.option = states.test(fcitx::KeyState::Alt);
    k.control = states.test(fcitx::KeyState::Ctrl);
    k.caps_lock = states.test(fcitx::KeyState::CapsLock);
    k.shift_broke = shiftBroke_;
    shiftBroke_ = false;

    CStep step;
    if (sym == FcitxKey_BackSpace) {
        // ⌃⌫ unconverts the glyph before the cursor back to its keystroke
        // spelling; a plain ⌫ peels a pending mark, then deletes.
        step = k.control ? ipabet_engine_handle_unconvert(engine_, state->buffer.c_str(), state->pending)
                         : ipabet_engine_handle_backspace(engine_, state->buffer.c_str(), state->pending);
    } else {
        step = ipabet_engine_handle_key(engine_, state->buffer.c_str(), k, state->pending, state->chainBroken);
    }

    if (step.edit.edit_type == Pass) {
        // Pass means the host puts the key's own character in the document.
        // Where the document can be read back that is the end of it, but here
        // the buffer is the only record of the run, so a printable key keeps
        // composing with its native character appended — drop it and the digit
        // in 5,⇧H is gone by the time ⇧H asks what preceded it. The keys that
        // genuinely end a run — ⌫, Escape, a Control chord — still go to the
        // client, including a ⌫ that has to eat committed text.
        char native[EDIT_TEXT_MAX];
        ipabet_native_char(k, native, sizeof(native));
        const bool endsRun = sym == FcitxKey_BackSpace || sym == FcitxKey_Escape || k.control;
        if (endsRun || native[0] == '\0') {
            flush(ic, state);
            return;
        }
        state->buffer += native;
    }

    state->pending = step.pending;
    if (step.has_chain_broken) {
        state->chainBroken = step.chain_broken;
    }
    switch (step.edit.edit_type) {
    case Insert:
        state->buffer += step.edit.text;
        break;
    case Replace:
        truncateCodepoints(state->buffer, step.edit.replace_length);
        state->buffer += step.edit.text;
        break;
    default: // Noop, and Pass whose native character is already appended
        break;
    }
    trim(ic, state);
    updatePreedit(ic, state);
    event.filterAndAccept();
}

} // namespace ipabet

FCITX_ADDON_FACTORY(ipabet::IpabetEngineFactory)
