"""16-bit height grids for the web build: elevation_m = offset_m + q * scale_m, q = little-endian uint16 (row-major, same layout as the old .f32).
Usage (convert existing float32 grids and patch terrain.json): python3 -I tools/terrain/quantize_dtm.py <dir_with_f32> <public/data/jezero>
extract_jezero.py imports quantize() and writes the .u16 files directly; the float32 grids are no longer shipped."""
import sys, os, json, hashlib
import numpy as np

def quantize(a):
    """float array -> (uint16 array, offset_m, scale_m). Max round-trip error is scale_m / 2."""
    a = np.asarray(a, dtype="f8"); lo, hi = float(a.min()), float(a.max()); scale = (hi - lo) / 65535.0 or 1.0
    return np.clip(np.rint((a - lo) / scale), 0, 65535).astype("<u2"), lo, scale

def dequantize(q, offset, scale): return (offset + q.astype("f8") * scale).astype("<f4")

if __name__ == "__main__":
    SRC, OUT = sys.argv[1], sys.argv[2]; mp = os.path.join(OUT, "terrain.json"); meta = json.load(open(mp))
    for key, base in (("near", "hirise_dtm_1m_640"), ("far", "ctx_dtm_20m_400")):
        a = np.fromfile(os.path.join(SRC, base + ".f32"), dtype="<f4"); q, off, sc = quantize(a); p = os.path.join(OUT, base + ".u16"); q.tofile(p)
        err = float(np.abs(dequantize(q, off, sc).astype("f8") - a.astype("f8")).max())
        meta[key]["dtm"] = dict(file=base + ".u16", encoding="uint16 little-endian, row-major; elevation_m = offset_m + q * scale_m", offset_m=off, scale_m=sc, max_abs_error_m=err,
                                quantized_from="float32 grid " + base + ".f32 (not shipped; regenerate with tools/terrain/extract_jezero.py)")
        old = meta["files"].pop(base + ".f32", None)
        meta["files"][base + ".u16"] = dict(bytes=os.path.getsize(p), sha256=hashlib.sha256(open(p, "rb").read()).hexdigest(), **({"source_f32_sha256": old["sha256"]} if old else {}))
        print(base, "range", off, off + 65535 * sc, "step_m", sc, "max_abs_error_m", err, "bytes", os.path.getsize(p))
    json.dump(meta, open(mp, "w"), indent=1)
