"""Shrink the Poly Haven 1k JPGs for the web build (file names stay the same so loaders do not change).
Usage: python3 -I tools/assets/recompress_polyhaven.py <dir_with_original_1k_jpgs> <out_dir_with_LICENSES.json>
  *_nor / *_rough : 512 x 512 (Lanczos), JPEG q80; normal maps keep full chroma (4:4:4), roughness is stored greyscale
  *_diff          : 1024 x 1024 kept, JPEG q82 (4:2:0)
Originals come from tools/assets/fetch_polyhaven.py (source URLs stay in LICENSES.json). LICENSES.json gets the shipped
bytes/sha256 plus source_bytes/source_sha256 of the original download."""
import sys, os, json, hashlib
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
lic = json.load(open(os.path.join(OUT, "LICENSES.json")))
sha = lambda b: hashlib.sha256(b).hexdigest()
for asset in lic.values():
    for fn, rec in asset["files"].items():
        src = open(os.path.join(SRC, fn), "rb").read(); im = Image.open(os.path.join(SRC, fn)); kind = fn.rsplit("_", 2)[1]
        if kind == "diff": im = im.convert("RGB"); kw = dict(quality=82, subsampling=2); note = "re-encoded JPEG q82, 1024 px kept"
        elif kind == "nor": im = im.convert("RGB").resize((512, 512), Image.LANCZOS); kw = dict(quality=80, subsampling=0); note = "resized to 512 px, JPEG q80 4:4:4"
        else: im = im.convert("L").resize((512, 512), Image.LANCZOS); kw = dict(quality=80); note = "resized to 512 px, greyscale JPEG q80"
        dst = os.path.join(OUT, fn); im.save(dst, "JPEG", optimize=True, progressive=True, **kw); b = open(dst, "rb").read()
        if "source_sha256" not in rec: rec["source_bytes"], rec["source_sha256"] = len(src), sha(src)
        rec.update(bytes=len(b), sha256=sha(b), width=im.width, processed=note)
        print(f"{fn:44s} {len(src):8d} -> {len(b):7d}")
json.dump(lic, open(os.path.join(OUT, "LICENSES.json"), "w"), indent=1, ensure_ascii=False)
