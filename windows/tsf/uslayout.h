// IPAbet's tables are keyed by the US-layout label of the PHYSICAL key, not by
// whatever character the user's layout produces — ⇧5 has to mean "the key left
// of 6" for the centralize modifier to sit where the chart says it does.
//
// That rules out the virtual-key code: Windows derives it from the active
// layout, so the same physical key arrives as a different VK under a German or
// French layout. The scancode does not move, so the mapping is a static table
// over scancodes, which is the same shape the fcitx5 addon uses over X11
// keycodes.
//
// A key absent from the table is one IPAbet never claims, so the caller
// declines it and the host layout keeps whatever it would have produced.

#ifndef IPABET_TSF_USLAYOUT_H
#define IPABET_TSF_USLAYOUT_H

#include <string>

namespace ipabet {

/// The unshifted US character for `scancode`, or "" for a key IPAbet has no
/// opinion about. The engine applies shift itself (⇧5 → %), so this is
/// deliberately the unshifted plane only.
inline std::string usLayoutLabel(unsigned scancode) {
    switch (scancode) {
    // number row
    case 0x02: return "1";
    case 0x03: return "2";
    case 0x04: return "3";
    case 0x05: return "4";
    case 0x06: return "5";
    case 0x07: return "6";
    case 0x08: return "7";
    case 0x09: return "8";
    case 0x0A: return "9";
    case 0x0B: return "0";
    case 0x0C: return "-";
    case 0x0D: return "=";
    // top letter row
    case 0x10: return "q";
    case 0x11: return "w";
    case 0x12: return "e";
    case 0x13: return "r";
    case 0x14: return "t";
    case 0x15: return "y";
    case 0x16: return "u";
    case 0x17: return "i";
    case 0x18: return "o";
    case 0x19: return "p";
    case 0x1A: return "[";
    case 0x1B: return "]";
    case 0x2B: return "\\";
    // home row
    case 0x1E: return "a";
    case 0x1F: return "s";
    case 0x20: return "d";
    case 0x21: return "f";
    case 0x22: return "g";
    case 0x23: return "h";
    case 0x24: return "j";
    case 0x25: return "k";
    case 0x26: return "l";
    case 0x27: return ";";
    case 0x28: return "'";
    case 0x29: return "`";
    // bottom row
    case 0x2C: return "z";
    case 0x2D: return "x";
    case 0x2E: return "c";
    case 0x2F: return "v";
    case 0x30: return "b";
    case 0x31: return "n";
    case 0x32: return "m";
    case 0x33: return ",";
    case 0x34: return ".";
    case 0x35: return "/";
    // the one non-printing key the engine takes by label
    case 0x39: return " ";
    default: return "";
    }
}

} // namespace ipabet

#endif // IPABET_TSF_USLAYOUT_H
