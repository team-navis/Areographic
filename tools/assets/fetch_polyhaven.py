"""Fetch CC0 PBR texture maps (1k JPG) from Poly Haven's public API. Usage: python3 -I tools/assets/fetch_polyhaven.py <out_dir>"""
import sys, os, json, urllib.request, hashlib
OUT = sys.argv[1]; UA = {"User-Agent": "Mozilla/5.0 research-client"}
IDS = ["metal_plate", "rubber_tiles", "fabric_pattern_07", "red_laterite_soil_stones", "rock_face", "fabric_leather_02", "painted_metal_shutter", "denim_fabric"]
MAPS = {"Diffuse": "diff", "nor_gl": "nor", "Rough": "rough"}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read()
rec = {}
for i in IDS:
    info = json.loads(get(f"https://api.polyhaven.com/info/{i}")); files = json.loads(get(f"https://api.polyhaven.com/files/{i}"))
    rec[i] = dict(name=info.get("name"), authors=list(info.get("authors", {}).keys()), license="CC0 1.0", page=f"https://polyhaven.com/a/{i}", files={})
    for k, short in MAPS.items():
        if k not in files: continue
        e = files[k]["1k"]["jpg"]; b = get(e["url"]); fn = f"{i}_{short}_1k.jpg"
        open(os.path.join(OUT, fn), "wb").write(b)
        rec[i]["files"][fn] = dict(url=e["url"], bytes=len(b), sha256=hashlib.sha256(b).hexdigest())
    print(i, rec[i]["name"], rec[i]["authors"], list(rec[i]["files"]))
json.dump(rec, open(os.path.join(OUT, "LICENSES.json"), "w"), indent=1)
