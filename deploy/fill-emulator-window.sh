#!/usr/bin/env bash
# Maximize Android Emulator to fill the entire Xvfb/VNC framebuffer.
# Hides extended-controls toolbar and sets solid black wallpaper (no DOCKERANDROID).
set -euo pipefail

docker exec umbrella-android bash -lc 'export DISPLAY=:0
python3 - << "PY"
import ctypes, ctypes.util, subprocess, zlib, struct, os, time

x11 = ctypes.CDLL(ctypes.util.find_library("X11"))
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
dpy = x11.XOpenDisplay(None)
if not dpy:
    raise SystemExit("no display")

Atom = ctypes.c_ulong
Window = ctypes.c_ulong
Status = ctypes.c_int

x11.XDefaultRootWindow.restype = Window
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
root = x11.XDefaultRootWindow(dpy)

# Screen size
class Screen(ctypes.Structure):
    pass  # unused

# Use env SCREEN_* as source of truth
sw = int(os.environ.get("SCREEN_WIDTH", "720"))
sh = int(os.environ.get("SCREEN_HEIGHT", "1280"))
print(f"target fill {sw}x{sh}")

x11.XInternAtom.restype = Atom
x11.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
_NET_CLIENT_LIST = x11.XInternAtom(dpy, b"_NET_CLIENT_LIST", 0)
_NET_WM_STATE = x11.XInternAtom(dpy, b"_NET_WM_STATE", 0)
_NET_WM_STATE_FULLSCREEN = x11.XInternAtom(dpy, b"_NET_WM_STATE_FULLSCREEN", 0)
_NET_WM_STATE_MAXIMIZED_VERT = x11.XInternAtom(dpy, b"_NET_WM_STATE_MAXIMIZED_VERT", 0)
_NET_WM_STATE_MAXIMIZED_HORZ = x11.XInternAtom(dpy, b"_NET_WM_STATE_MAXIMIZED_HORZ", 0)

actual_type = Atom()
actual_format = ctypes.c_int()
nitems = ctypes.c_ulong()
bytes_after = ctypes.c_ulong()
prop = ctypes.POINTER(ctypes.c_ulong)()

x11.XGetWindowProperty.restype = Status
x11.XGetWindowProperty.argtypes = [
    ctypes.c_void_p, Window, Atom, ctypes.c_long, ctypes.c_long, ctypes.c_int, Atom,
    ctypes.POINTER(Atom), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_ulong),
    ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)),
]
x11.XGetWindowProperty(
    dpy, root, _NET_CLIENT_LIST, 0, 1024, 0, 33,
    ctypes.byref(actual_type), ctypes.byref(actual_format), ctypes.byref(nitems),
    ctypes.byref(bytes_after), ctypes.byref(prop),
)

class A(ctypes.Structure):
    _fields_ = [
        ("x", ctypes.c_int), ("y", ctypes.c_int), ("width", ctypes.c_int), ("height", ctypes.c_int),
        ("border_width", ctypes.c_int), ("depth", ctypes.c_int), ("visual", ctypes.c_void_p),
        ("root", Window), ("class", ctypes.c_int), ("bit_gravity", ctypes.c_int),
        ("win_gravity", ctypes.c_int), ("backing_store", ctypes.c_int),
        ("backing_planes", ctypes.c_ulong), ("backing_pixel", ctypes.c_ulong),
        ("save_under", ctypes.c_int), ("colormap", ctypes.c_ulong),
        ("map_installed", ctypes.c_int), ("map_state", ctypes.c_int),
        ("all_event_masks", ctypes.c_long), ("your_event_mask", ctypes.c_long),
        ("do_not_propagate_mask", ctypes.c_long), ("override_redirect", ctypes.c_int),
        ("screen", ctypes.c_void_p),
    ]

x11.XGetWindowAttributes.restype = Status
x11.XGetWindowAttributes.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(A)]
x11.XFetchName.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(ctypes.c_char_p)]
x11.XMoveResizeWindow.argtypes = [ctypes.c_void_p, Window, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint]
x11.XMapRaised.argtypes = [ctypes.c_void_p, Window]
x11.XDestroyWindow.argtypes = [ctypes.c_void_p, Window]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XSendEvent.argtypes = [ctypes.c_void_p, Window, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]

class XClientMessageEvent(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int), ("serial", ctypes.c_ulong), ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p), ("window", Window), ("message_type", Atom),
        ("format", ctypes.c_int), ("data", ctypes.c_long * 5),
    ]

class XEvent(ctypes.Union):
    _fields_ = [("type", ctypes.c_int), ("xclient", XClientMessageEvent), ("pad", ctypes.c_long * 24)]

mask = (1 << 20) | (1 << 19)  # SubstructureRedirect|Notify

def send_state(win, *atoms):
    ev = XEvent()
    ev.xclient.type = 33
    ev.xclient.send_event = 1
    ev.xclient.display = dpy
    ev.xclient.window = win
    ev.xclient.message_type = _NET_WM_STATE
    ev.xclient.format = 32
    ev.xclient.data[0] = 1  # ADD
    for i, a in enumerate(atoms[:4]):
        ev.xclient.data[i + 1] = a
    x11.XSendEvent(dpy, root, 0, mask, ctypes.byref(ev))

print("clients", nitems.value)
for i in range(nitems.value):
    w = prop[i]
    name = ctypes.c_char_p()
    title = ""
    if x11.XFetchName(dpy, w, ctypes.byref(name)) and name:
        title = name.value.decode(errors="replace")
        x11.XFree(name)
    a = A()
    x11.XGetWindowAttributes(dpy, w, ctypes.byref(a))
    print(f"  before {title!r} {a.width}x{a.height} @ {a.x},{a.y}")
    if "Emulator" in title or "Android" in title:
        x11.XMapRaised(dpy, w)
        # Strip decorations via maximize+fullscreen hints, then hard resize
        send_state(w, _NET_WM_STATE_MAXIMIZED_HORZ, _NET_WM_STATE_MAXIMIZED_VERT)
        send_state(w, _NET_WM_STATE_FULLSCREEN)
        x11.XMoveResizeWindow(dpy, w, 0, 0, sw, sh)
        print(f"  maximized {title!r} -> {sw}x{sh}@0,0")
    elif a.width <= 120 and a.height >= 300:
        x11.XDestroyWindow(dpy, w)
        print("  destroyed toolbar")

x11.XFlush(dpy)

# Solid black wallpaper — overwrite docker-android fehbg target
def png(w, h, rgb=(0, 0, 0)):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )

bg_path = "/home/androidusr/docker-android/mixins/configs/display/background.png"
black = png(sw, sh)
try:
    open(bg_path, "wb").write(black)
    print("wrote black background.png")
except Exception as e:
    print("bg write failed", e)
    open("/tmp/black.png", "wb").write(black)
    bg_path = "/tmp/black.png"

subprocess.call(["feh", "--bg-fill", bg_path])
# Persist fehbg
try:
    open("/home/androidusr/docker-android/mixins/configs/display/.fehbg", "w").write(
        f"#!/bin/sh\\nfeh --bg-fill {bg_path}\\n"
    )
except Exception:
    pass
print("done")
PY
'
