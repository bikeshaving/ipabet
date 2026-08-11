// IPAbet's tables are keyed by the US-layout label of the PHYSICAL key, not
// by whatever character the user's layout produces — ⇧5 has to mean "the key
// left of 6" for the centralize modifier to sit where the chart says it does.
// macOS gets that by translating the keycode through the US uchr resource;
// here the same mapping is a static table over X11 keycodes (evdev + 8, which
// is what fcitx5 reports on both xcb and wayland frontends).
//
// A key absent from the table is one IPAbet never claims, so the caller
// declines it and the host layout keeps whatever it would have produced.

#ifndef IPABET_USLAYOUT_H
#define IPABET_USLAYOUT_H

#include <string>

namespace ipabet {

/// The unshifted US character for `code`, or "" for a key IPAbet has no
/// opinion about. The engine applies shift itself (⇧5 → %), so this is
/// deliberately the unshifted plane only.
inline std::string usLayoutLabel(int code) {
    switch (code) {
    // number row
    case 10: return "1";
    case 11: return "2";
    case 12: return "3";
    case 13: return "4";
    case 14: return "5";
    case 15: return "6";
    case 16: return "7";
    case 17: return "8";
    case 18: return "9";
    case 19: return "0";
    case 20: return "-";
    case 21: return "=";
    // top letter row
    case 24: return "q";
    case 25: return "w";
    case 26: return "e";
    case 27: return "r";
    case 28: return "t";
    case 29: return "y";
    case 30: return "u";
    case 31: return "i";
    case 32: return "o";
    case 33: return "p";
    case 34: return "[";
    case 35: return "]";
    case 51: return "\\";
    // home row
    case 38: return "a";
    case 39: return "s";
    case 40: return "d";
    case 41: return "f";
    case 42: return "g";
    case 43: return "h";
    case 44: return "j";
    case 45: return "k";
    case 46: return "l";
    case 47: return ";";
    case 48: return "'";
    case 49: return "`";
    // bottom row
    case 52: return "z";
    case 53: return "x";
    case 54: return "c";
    case 55: return "v";
    case 56: return "b";
    case 57: return "n";
    case 58: return "m";
    case 59: return ",";
    case 60: return ".";
    case 61: return "/";
    // the one non-printing key the engine takes by label
    case 65: return " ";
    default: return "";
    }
}

} // namespace ipabet

#endif // IPABET_USLAYOUT_H
