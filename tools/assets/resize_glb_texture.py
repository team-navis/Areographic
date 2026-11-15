"""Downsize the JPEG images embedded in a .glb (binary chunk rewritten in place; geometry/Draco buffer views are copied byte for byte).
Usage: python3 -I tools/assets/resize_glb_texture.py <in.glb> <out.glb> [max_px=1024] [quality=85]
(gltf-transform's resize needs sharp, whose install script is blocked here, so this does the same with PIL.)"""
import sys, json, struct, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024; Q = int(sys.argv[4]) if len(sys.argv) > 4 else 85
b = open(src, "rb").read(); magic, ver, total = struct.unpack_from("<III", b, 0); assert magic == 0x46546C67 and ver == 2
jl, jt = struct.unpack_from("<II", b, 12); assert jt == 0x4E4F534A; g = json.loads(b[20:20 + jl]); o = 20 + jl
bl, bt = struct.unpack_from("<II", b, o); assert bt == 0x004E4942; bin_ = b[o + 8:o + 8 + bl]
assert len(g["buffers"]) == 1
img_views = {im["bufferView"]: im for im in g.get("images", []) if "bufferView" in im}
out = bytearray()
for i, v in enumerate(g["bufferViews"]):  # views are re-packed in index order, 4-byte aligned
    data = bin_[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
    if i in img_views and img_views[i].get("mimeType") == "image/jpeg":
        im = Image.open(io.BytesIO(data)).convert("RGB"); w0 = im.size
        if max(im.size) > MAX: im = im.resize((MAX * im.width // max(im.size), MAX * im.height // max(im.size)), Image.LANCZOS)
        f = io.BytesIO(); im.save(f, "JPEG", quality=Q, optimize=True, progressive=True, subsampling=2); print(f"image view {i}: {w0} {len(data)} B -> {im.size} {f.tell()} B"); data = f.getvalue()
    while len(out) % 4: out.append(0)
    v["byteOffset"] = len(out); v["byteLength"] = len(data); out += data
while len(out) % 4: out.append(0)
g["buffers"][0]["byteLength"] = len(out)
j = json.dumps(g, separators=(",", ":")).encode(); j += b" " * (-len(j) % 4)
open(dst, "wb").write(struct.pack("<III", magic, 2, 12 + 8 + len(j) + 8 + len(out)) + struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(out), 0x004E4942) + bytes(out))
print(len(b), "->", 28 + len(j) + len(out))
