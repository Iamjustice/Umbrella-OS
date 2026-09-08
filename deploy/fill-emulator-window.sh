#!/usr/bin/env bash
# Move Android Emulator window to 0,0 inside umbrella-android Xvfb.
set -euo pipefail
docker exec umbrella-android bash -lc 'export DISPLAY=:0
python3 - << "PY"
import ctypes, ctypes.util, time
x11=ctypes.CDLL(ctypes.util.find_library("X11"))
x11.XOpenDisplay.restype=ctypes.c_void_p
x11.XOpenDisplay.argtypes=[ctypes.c_char_p]
dpy=x11.XOpenDisplay(None)
if not dpy: raise SystemExit("no display")
Atom=ctypes.c_ulong; Window=ctypes.c_ulong
x11.XDefaultRootWindow.restype=Window; x11.XDefaultRootWindow.argtypes=[ctypes.c_void_p]
root=x11.XDefaultRootWindow(dpy)
x11.XInternAtom.restype=Atom; x11.XInternAtom.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int]
_NET=x11.XInternAtom(dpy,b"_NET_CLIENT_LIST",0)
actual_type=Atom(); actual_format=ctypes.c_int(); nitems=ctypes.c_ulong(); bytes_after=ctypes.c_ulong(); prop=ctypes.POINTER(ctypes.c_ulong)()
x11.XGetWindowProperty.argtypes=[ctypes.c_void_p,Window,Atom,ctypes.c_long,ctypes.c_long,ctypes.c_int,Atom,ctypes.POINTER(Atom),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong))]
x11.XGetWindowProperty(dpy,root,_NET,0,1024,0,33,ctypes.byref(actual_type),ctypes.byref(actual_format),ctypes.byref(nitems),ctypes.byref(bytes_after),ctypes.byref(prop))
x11.XFetchName.argtypes=[ctypes.c_void_p,Window,ctypes.POINTER(ctypes.c_char_p)]
x11.XMoveResizeWindow.argtypes=[ctypes.c_void_p,Window,ctypes.c_int,ctypes.c_int,ctypes.c_uint,ctypes.c_uint]
x11.XMapRaised.argtypes=[ctypes.c_void_p,Window]
x11.XFlush.argtypes=[ctypes.c_void_p]
# Destroy extended-controls toolbar (nameless ~54px wide)
x11.XDestroyWindow.argtypes=[ctypes.c_void_p,Window]
class A(ctypes.Structure):
  _fields_=[("x",ctypes.c_int),("y",ctypes.c_int),("width",ctypes.c_int),("height",ctypes.c_int),("border_width",ctypes.c_int),("depth",ctypes.c_int),("visual",ctypes.c_void_p),("root",Window),("class",ctypes.c_int),("bit_gravity",ctypes.c_int),("win_gravity",ctypes.c_int),("backing_store",ctypes.c_int),("backing_planes",ctypes.c_ulong),("backing_pixel",ctypes.c_ulong),("save_under",ctypes.c_int),("colormap",ctypes.c_ulong),("map_installed",ctypes.c_int),("map_state",ctypes.c_int),("all_event_masks",ctypes.c_long),("your_event_mask",ctypes.c_long),("do_not_propagate_mask",ctypes.c_long),("override_redirect",ctypes.c_int),("screen",ctypes.c_void_p)]
x11.XGetWindowAttributes.argtypes=[ctypes.c_void_p,Window,ctypes.POINTER(A)]
for i in range(nitems.value):
  w=prop[i]; name=ctypes.c_char_p(); title=""
  if x11.XFetchName(dpy,w,ctypes.byref(name)) and name:
    title=name.value.decode(errors="replace"); x11.XFree(name)
  a=A(); x11.XGetWindowAttributes(dpy,w,ctypes.byref(a))
  if "Emulator" in title or "Android" in title:
    x11.XMapRaised(dpy,w)
    x11.XMoveResizeWindow(dpy,w,0,0,360,640)
    print("moved", title, "-> 360x640@0,0")
  elif a.width <= 80 and a.height >= 400:
    x11.XDestroyWindow(dpy,w)
    print("destroyed toolbar", a.width, a.height)
x11.XFlush(dpy)
# black bg
import subprocess, zlib, struct
def png(w,h,rgb=(0,0,0)):
  def chunk(t,d):
    return struct.pack(">I",len(d))+t+d+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
  raw=b"".join(b"\x00"+bytes(rgb)*w for _ in range(h))
  return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b"")
open("/tmp/black.png","wb").write(png(360,640))
subprocess.call(["feh","--bg-fill","/tmp/black.png"])
print("done")
PY
'
