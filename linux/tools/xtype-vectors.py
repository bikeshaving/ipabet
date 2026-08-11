#!/usr/bin/env python3
# Replay parity vectors as real X11 keystrokes into a real GtkEntry through the
# real fcitx5 stack, and diff what the client received against what the vector
# says. Everything upstream of the client -- xdotool, the GTK im module, the
# fcitx5 daemon, the addon, the engine -- is under test here.
import json
import os
import subprocess
import sys
import time

VECTORS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "spec", "parity-vectors.json")
OUT = "/tmp/entry.txt"

# The vectors name a key by the label the engine sees, which is not always what
# a person presses: "|" is typed as shift+backslash, "H" as shift+h. Translating
# label back to physical keystroke is exactly what the addon does in reverse, so
# getting it right here is part of what is under test.
KEYSYM = {
    " ": "space", "-": "minus", "=": "equal", "[": "bracketleft",
    "]": "bracketright", "\\": "backslash", ";": "semicolon",
    "'": "apostrophe", "`": "grave", ",": "comma", ".": "period",
    "/": "slash", "Escape": "Escape", "\u232b": "BackSpace",
}

# Labels that only exist on a shifted key.
SHIFTED = {"|": "backslash"}


def spec(k):
    key = k["key"]
    shift = bool(k.get("shift"))

    if key in SHIFTED:
        name, shift = SHIFTED[key], True
    elif len(key) == 1 and key.isalpha():
        # A capital label means the shifted key, whatever the flag says.
        shift = shift or key.isupper()
        name = key.lower()
    else:
        name = KEYSYM.get(key, key)

    mods = []
    if k.get("option"):
        mods.append("alt")
    if shift:
        mods.append("shift")
    return "+".join(mods + [name])


def typeable(v):
    """Every key has to be one xdotool can actually send, or the run desyncs."""
    for k in v["keys"]:
        key = k["key"]
        if key in KEYSYM or key in SHIFTED:
            continue
        if len(key) == 1 and (key.isalnum() or key in "-=[]\\;\'`,./ "):
            continue
        return False
    return True


def run(*args):
    return subprocess.run(args, capture_output=True, text=True).stdout.strip()


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    vectors = json.load(open(VECTORS))
    eligible = [v for v in vectors
                if v["initial"] == "" and v["locale"] == "en" and not v["capital_digraphs"]]
    usable = [v for v in eligible if typeable(v)]
    if len(usable) != len(eligible):
        print(f"skipping {len(eligible) - len(usable)} vectors xdotool cannot type")
    # A deterministic spread across the file rather than the first N, which all
    # come from the same test file and exercise the same few rules.
    if len(sys.argv) > 2 and sys.argv[2] == "tricky":
        # The labels that are not the key a person presses: "H" is shift+h,
        # "|" is shift+backslash, the backspace glyph is the Backspace key.
        marks = {"H", "|", "\u232b", "Escape"}
        sample = [v for v in usable if any(k["key"] in marks for k in v["keys"])]
        print(f"{len(sample)} vectors use a label that is not the key pressed")
    else:
        step = max(1, len(usable) // limit)
        sample = usable[::step][:limit]

    wid = run("xdotool", "search", "--name", "ipabet-test-entry").split("\n")[0]
    if not wid:
        print("FAIL: no test-entry window")
        return 1
    run("xdotool", "windowactivate", "--sync", wid)
    time.sleep(0.5)

    seen = ""
    fails = []
    for i, v in enumerate(sample):
        for k in v["keys"]:
            subprocess.run(["xdotool", "key", "--clearmodifiers", "--delay", "60", spec(k)])
        # A key IPAbet declines ends the run and flushes the preedit.
        subprocess.run(["xdotool", "key", "--clearmodifiers", "Right"])
        time.sleep(0.35)
        text = open(OUT).read() if os.path.exists(OUT) else ""
        got = text[len(seen):]
        seen = text
        if got != v["expected"]:
            fails.append((["".join(spec(k)) for k in v["keys"]], v["expected"], got))

    print(f"ran {len(sample)} vectors, {len(fails)} failed")
    for keys, exp, got in fails[:15]:
        print(f"  keys={keys} expected={exp!r} got={got!r}")
    return 1 if fails else 0


sys.exit(main())
