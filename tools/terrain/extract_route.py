"""Build the demo route from Perseverance's actual drive path (public M20 traverse layer).

Usage (repo root):  python3 -I tools/terrain/extract_route.py <cache_dir> public/data/jezero
Needs public/data/jezero/terrain.json + hirise_dtm_1m_640.u16 (from extract_jezero.py). Downloads
M20_traverse.json into the cache dir if missing. Writes route.json. Nothing here is hand-drawn:
every vertex is a vertex of the mission-published traverse polyline.
"""
import sys, os, json, math, hashlib, urllib.request
import numpy as np
CACHE, OUT = sys.argv[1], sys.argv[2]
URL = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json"
SEGMENTS = ["52_7624>53_0", "53_0>53_130", "53_130>54_0", "54_0>54_702", "54_702>54_866", "54_866>54_1010"]  # drive order toward the Cheyava Falls workspace
p = os.path.join(CACHE, "M20_traverse.json")
if not os.path.exists(p):
    with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 research-client"}), timeout=300) as r: open(p, "wb").write(r.read())
tr = json.load(open(p)); meta = json.load(open(os.path.join(OUT, "terrain.json")))
R = 3396190.0; L = meta["local_frame"]; k = L["cos_lat0"]; N = meta["near"]
D = N["dtm"]; dtm = (D["offset_m"] + np.fromfile(os.path.join(OUT, D["file"]), dtype="<u2").astype("f8") * D["scale_m"]).reshape(N["n"], N["n"])  # 16-bit grid, see quantize_dtm.py
def h(x, y):
    fc = x - N["x_min"] - 0.5; fr = N["y_max"] - y - 0.5; c = int(math.floor(fc)); r = int(math.floor(fr)); u = fc - c; v = fr - r
    return float(dtm[r, c] * (1 - u) * (1 - v) + dtm[r, c + 1] * u * (1 - v) + dtm[r + 1, c] * (1 - u) * v + dtm[r + 1, c + 1] * u * v)
by = {f'{f["properties"]["fromRMC"]}>{f["properties"]["toRMC"]}': f for f in tr["features"]}
segs = []; allpts = []
for key in SEGMENTS:
    f = by[key]; pr = f["properties"]; assert f["geometry"]["type"] == "LineString"
    pts = [[R * math.radians(c[0]), R * math.radians(c[1])] for c in f["geometry"]["coordinates"]]
    local = [((x - L["origin_x_eqc"]) * k, y - L["origin_y_eqc"], h(x, y) - L["origin_elev_hirise_dtm"]) for x, y in pts]
    ln = sum(math.dist(local[i][:2], local[i - 1][:2]) for i in range(1, len(local)))
    segs.append(dict(key=key, sol=pr["sol"], fromRMC=pr["fromRMC"], toRMC=pr["toRMC"], published_length_m=pr["length"], computed_plan_length_m=ln, n=len(pts), xy_eqc=pts,
                     has_z=len(f["geometry"]["coordinates"][0]) > 2))
    allpts += local if not allpts else local[1:] if math.dist(local[0][:2], allpts[-1][:2]) < 0.05 else local
# independent statistics (plain Python; the browser computes its own and the test compares them)
plan = sum(math.dist(allpts[i][:2], allpts[i - 1][:2]) for i in range(1, len(allpts)))
len3d = sum(math.dist(allpts[i], allpts[i - 1]) for i in range(1, len(allpts)))
# slope over a 5 m along-track baseline
cum = [0.0]
for i in range(1, len(allpts)): cum.append(cum[-1] + math.dist(allpts[i][:2], allpts[i - 1][:2]))
slopes = []; j = 0
for i in range(len(allpts)):
    while cum[i] - cum[j] > 5.0: j += 1
    if j > 0 and cum[i] - cum[j - 1] >= 5.0:
        run = math.dist(allpts[i][:2], allpts[j - 1][:2])
        if run > 2.5: slopes.append(math.degrees(math.atan(abs(allpts[i][2] - allpts[j - 1][2]) / run)))
gaps = [math.dist(allpts[i][:2], allpts[i - 1][:2]) for i in range(1, len(allpts))]
out = dict(source=URL, sha256=hashlib.sha256(open(p, "rb").read()).hexdigest(), credit="Rover traverse/localization: NASA/JPL-Caltech (Mars 2020 mission, public MMGIS layer)",
           note="Vertices are the published drive polyline of Perseverance (sols 1175-1185). xy_eqc uses the same frame as terrain.json.",
           segments=segs, python_check=dict(vertices=len(allpts), plan_length_m=plan, length_3d_m=len3d, max_slope_5m_deg=max(slopes), mean_slope_5m_deg=sum(slopes) / len(slopes),
                                            vertex_gap_max_m=max(gaps), vertex_gap_mean_m=sum(gaps) / len(gaps), start_local=allpts[0], end_local=allpts[-1]))
json.dump(out, open(os.path.join(OUT, "route.json"), "w"))
print(json.dumps({**out["python_check"], "segments": [(s["key"], s["sol"], s["n"], s["published_length_m"], round(s["computed_plan_length_m"], 2), s["has_z"]) for s in segs]}, indent=1))
wp = {f'{w["site"]}_{w["drive"]}': w for w in meta["waypoints"]}
e = allpts[-1]; t = wp["56_0"]; print("end vertex -> 56_0 waypoint distance", math.hypot(e[0] - t["east_m"], e[1] - t["north_m"]))
for i, q in enumerate(allpts[:30]): 
    if i % 3 == 0: print(i, [round(v, 2) for v in q])
