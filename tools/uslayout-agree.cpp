// The two physical-key tables have to describe the same keyboard.
//
// Windows keys them by scancode, Linux by X11 keycode, and X11 keycodes are
// evdev codes plus 8 — the same physical numbering twice. A key that drifts
// between them means the same physical key types one glyph on Windows and a
// different one on Linux, which no port's own tests can see: each one is
// self-consistent.
//
// Neither table depends on its platform, so this compiles and runs anywhere.
//   c++ -std=c++17 tools/uslayout-agree.cpp -o /tmp/uslayout-agree && /tmp/uslayout-agree

#include "../windows/tsf/uslayout.h"
#include "../linux/common/uslayout.h"

#include <cstdio>
#include <map>
#include <string>

namespace {

int failures = 0;

void fail(const std::string &what) {
    std::printf("  ✗ %s\n", what.c_str());
    failures++;
}

std::string linuxLabel(unsigned scancode) {
    const char *s = ipabet_us_layout_label((int)scancode + 8);
    return s ? s : "";
}

} // namespace

int main() {
    // The ISO extra key, the one ANSI keyboards do not have: between left shift
    // and Z on a 105-key board. It has no US label, so IPAbet must never claim
    // it and the host layout keeps whatever it produces — < and > on most.
    const unsigned ISO_EXTRA = 0x56;

    int mapped = 0;
    std::map<std::string, unsigned> seen;

    for (unsigned sc = 0; sc < 0x80; sc++) {
        const std::string win = ipabet::usLayoutLabel(sc);
        const std::string lin = linuxLabel(sc);
        if (win != lin) {
            char buf[160];
            std::snprintf(buf, sizeof buf,
                          "scancode 0x%02X: Windows says \"%s\", Linux says \"%s\"", sc,
                          win.c_str(), lin.c_str());
            fail(buf);
            continue;
        }
        if (win.empty()) continue;
        mapped++;

        // One physical key per label. Two keys claiming the same label would
        // make a glyph reachable from two places and unreachable from neither
        // in any obvious way.
        auto [it, fresh] = seen.emplace(win, sc);
        if (!fresh) {
            char buf[160];
            std::snprintf(buf, sizeof buf, "label \"%s\" is on both 0x%02X and 0x%02X",
                          win.c_str(), it->second, sc);
            fail(buf);
        }
    }

    if (!ipabet::usLayoutLabel(ISO_EXTRA).empty() || !linuxLabel(ISO_EXTRA).empty()) {
        fail("the ISO extra key has a label — IPAbet would eat a key ANSI does not have");
    }

    // Every key the notation stands on. ⇧5 is the centralize modifier, which is
    // the whole reason these tables are keyed by position rather than by what
    // the layout produces.
    const std::string required = "abcdefghijklmnopqrstuvwxyz0123456789-=[]\\;'`,./ ";
    for (char c : required) {
        bool found = false;
        for (const auto &[label, sc] : seen) {
            (void)sc;
            if (label.size() == 1 && label[0] == c) {
                found = true;
                break;
            }
        }
        if (!found) {
            char buf[80];
            std::snprintf(buf, sizeof buf, "no physical key produces \"%c\"", c);
            fail(buf);
        }
    }

    std::printf("%d keys, both tables agreeing\n", mapped);
    if (failures) {
        std::printf("✗ %d problem(s)\n", failures);
        return 1;
    }
    std::printf("✓ the two ports describe the same keyboard\n");
    return 0;
}
