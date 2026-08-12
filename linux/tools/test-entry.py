#!/usr/bin/env python3
# A deliberately tiny text-entry target for the fcitx5 gate: one window, one
# GtkEntry, and every committed change mirrored to a file so the harness can
# read back what the input method actually produced.
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk

OUT = "/tmp/entry.txt"
WID_OUT = "/tmp/entry-wid.txt"


def on_changed(entry):
    with open(OUT, "w") as f:
        f.write(entry.get_text())


def publish_window_id(*_):
    # Only once mapped: before that there is no underlying window to ask, and
    # asking early wrote an empty file that cost an afternoon.
    gdk_window = win.get_window()
    if gdk_window is not None:
        with open(WID_OUT, "w") as f:
            f.write(str(gdk_window.get_xid()))
    return False


win = Gtk.Window(title="ipabet-test-entry")
win.connect("map-event", publish_window_id)
win.set_default_size(600, 80)
win.connect("destroy", Gtk.main_quit)
entry = Gtk.Entry()
entry.connect("changed", on_changed)
win.add(entry)
win.show_all()
entry.grab_focus()
open(OUT, "w").close()

Gtk.main()
