"""Extract a small Jezero / Bright Angel terrain window from public USGS/NASA Mars 2020 TRN mosaics.

Reads only the needed rows of the 1.8 GB HiRISE DTM and 7.4 GB HiRISE orthomosaic through HTTP
range requests (no full mirror). CTX 20 m DTM / 6 m ortho (9.7 MB / 36 MB) are downloaded whole
into the cache dir. Usage:
    python3 -I tools/terrain/extract_jezero.py <cache_dir> <out_dir>
Run from the repo root. Requires numpy and Pillow (already-installed system packages; nothing is installed).
"""
import sys, os, json, math, hashlib, urllib.request
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import rtiff
from quantize_dtm import quantize, dequantize
Image.MAX_IMAGE_PIXELS = None

CACHE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
BASEURL = "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/"
SRC = {
  "hirise_dtm": BASEURL + "HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
  "hirise_ortho": BASEURL + "HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif",
  "ctx_dtm": BASEURL + "CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
  "ctx_ortho": BASEURL + "CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif",
  "waypoints": "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json",
}
R_MARS = 3396190.0            # sphere radius declared in the GeoTIFF keys (Mars 2000 Sphere IAU)
NEAR_M = 640                  # HiRISE window edge (m == px at 1 m)
FAR_HALF_M = 4000             # CTX window half-size
CENTER_LON, CENTER_LAT = 77.3050, 18.4962   # window centre (deg E, planetocentric deg N)
SOL_MIN, SOL_MAX = 1171, 1220

def X(lon): return R_MARS * math.radians(lon)
def Y(lat): return R_MARS * math.radians(lat)

def fetch_file(url, name):
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        req = urllib.request.Request(url, headers=rtiff.UA)
        with urllib.request.urlopen(req, timeout=600) as r, open(p, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
    return p

def remote_window(key, c0, r0, w, h):
    """Row-parallel range read of an uncompressed, one-row-per-strip TIFF."""
    cache = os.path.join(CACHE, f"{key}_{c0}_{r0}_{w}_{h}.npy")
    src = rtiff.Remote(SRC[key]); t = rtiff.parse(src); d = rtiff.info(t)
    if os.path.exists(cache): return np.load(cache), d
    assert d["comp"] == 1 and not d["tiled"] and d["rps"] == 1, d
    offs = t["get"](273)
    bps = d["bps"][0]; B = bps // 8
    dt = np.dtype({(8, 1): "u1", (32, 3): "f4"}[(bps, d["fmt"])]).newbyteorder(t["bo"])
    out = np.zeros((h, w), dtype=dt.newbyteorder("="))
    def row(i):
        o = offs[r0 + i] + c0 * B
        for attempt in range(4):
            try:
                return i, np.frombuffer(src.read(o, w * B), dtype=dt)
            except Exception as e:  # retry transient network errors
                err = e
        raise err
    with ThreadPoolExecutor(16) as ex:
        for i, a in ex.map(row, range(h)): out[i] = a
    np.save(cache, out)
    return out, d

def local_window(path, cx, cy, half_m):
    im = Image.open(path); t = im.tag_v2
    s = t[33550][0]; x0, y0 = t[33922][3], t[33922][4]
    n = int(round(2 * half_m / s))
    c0 = int(round((cx - half_m - x0) / s)); r0 = int(round((y0 - (cy + half_m)) / s))
    assert c0 >= 0 and r0 >= 0 and c0 + n <= im.size[0] and r0 + n <= im.size[1], (c0, r0, n, im.size)
    a = np.array(im.crop((c0, r0, c0 + n, r0 + n)))
    return a, dict(scale=s, x_min=x0 + c0 * s, y_max=y0 - r0 * s, n=n, nodata=str(t.get(42113)))

cx, cy = X(CENTER_LON), Y(CENTER_LAT)
# ---------- HiRISE 1 m DTM + 25 cm ortho (range requests) ----------
probe = rtiff.Remote(SRC["hirise_dtm"]); pd = rtiff.info(rtiff.parse(probe))
hx0, hy0 = pd["tie"][3], pd["tie"][4]
c0 = int(round(cx - NEAR_M / 2 - hx0)); r0 = int(round(hy0 - (cy + NEAR_M / 2)))
dtm, dinfo = remote_window("hirise_dtm", c0, r0, NEAR_M, NEAR_M)
ortho, oinfo = remote_window("hirise_ortho", c0 * 4, r0 * 4, NEAR_M * 4, NEAR_M * 4)
near = dict(x_min=hx0 + c0, y_max=hy0 - r0, n=NEAR_M, scale=1.0)
nodata_near = int((dtm < -1e30).sum()); ortho_zero = int((ortho == 0).sum())
assert nodata_near == 0, f"NoData inside HiRISE window: {nodata_near}"

# ---------- CTX 20 m DTM + 6 m ortho (whole small files) ----------
ctx_dtm, cinfo = local_window(fetch_file(SRC["ctx_dtm"], "ctx_dtm.tif"), cx, cy, FAR_HALF_M)
ctx_ortho, coinfo = local_window(fetch_file(SRC["ctx_ortho"], "ctx_ortho.tif"), cx, cy, FAR_HALF_M)
nodata_far = int((ctx_dtm < -1e30).sum())

# ---------- waypoints (Perseverance localization, public MMGIS layer) ----------
wp = json.load(open(fetch_file(SRC["waypoints"], "M20_waypoints.json")))
def dtm_at(x, y):   # bilinear, pixel-is-area: centre of pixel (c, r) is x_min + c + 0.5
    fc = x - near["x_min"] - 0.5; fr = near["y_max"] - y - 0.5
    c = int(math.floor(fc)); r = int(math.floor(fr)); u = fc - c; v = fr - r
    if not (0 <= c < NEAR_M - 1 and 0 <= r < NEAR_M - 1): return None
    return float(dtm[r, c] * (1 - u) * (1 - v) + dtm[r, c + 1] * u * (1 - v) + dtm[r + 1, c] * (1 - u) * v + dtm[r + 1, c + 1] * u * v)
pts = []
for f in wp["features"]:
    p = f["properties"]
    if SOL_MIN <= p["sol"] <= SOL_MAX:
        x, y = X(p["lon"]), Y(p["lat"]); z = dtm_at(x, y)
        pts.append(dict(sol=p["sol"], site=p["site"], drive=p["drive"], lon=p["lon"], lat=p["lat"],
                        elev_geoid_m20=p["elev_geoid"], m20_easting=p["easting"], m20_northing=p["northing"],
                        x_eqc=x, y_eqc=y, hirise_dtm_elev=z))

# local metric frame: origin = Perseverance waypoint sol 1174 (fictional demo base site)
o = next(p for p in pts if p["sol"] == 1174)
lat0 = o["lat"]; k = math.cos(math.radians(lat0))
for p in pts:
    p["east_m"] = (p["x_eqc"] - o["x_eqc"]) * k
    p["north_m"] = p["y_eqc"] - o["y_eqc"]
# independent checks ---------------------------------------------------
# (a) M20 easting/northing are in a different projected frame (published by the mission); differences
#     between two waypoints give an independent distance for the same pair.
a = o; b = next(p for p in pts if p["site"] == 56 and p["drive"] == 0)
d_local = math.hypot(b["east_m"] - a["east_m"], b["north_m"] - a["north_m"])
d_m20 = math.hypot(b["m20_easting"] - a["m20_easting"], b["m20_northing"] - a["m20_northing"])
# (b) great-circle distance directly from lon/lat
la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
d_gc = 2 * R_MARS * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))
# (c) DTM elevation vs. mission-reported elevation at each waypoint
dz = [p["hirise_dtm_elev"] - p["elev_geoid_m20"] for p in pts if p["hirise_dtm_elev"] is not None]
checks = dict(base_to_cheyava_local_m=d_local, base_to_cheyava_m20_grid_m=d_m20, base_to_cheyava_great_circle_m=d_gc,
              dtm_minus_m20_elev_mean=float(np.mean(dz)), dtm_minus_m20_elev_min=float(np.min(dz)), dtm_minus_m20_elev_max=float(np.max(dz)),
              n_waypoints=len(pts))

# slope around candidate base site (10 m radius, 1 m DTM)
gy, gx = np.gradient(dtm.astype("f8"))          # per-pixel; rows are 1 m N-S, cols are 1 m in X (== k m E-W)
slope = np.degrees(np.arctan(np.hypot(gx / k, gy)))
bc = int(o["x_eqc"] - near["x_min"]); br = int(near["y_max"] - o["y_eqc"])
site = slope[br - 10:br + 11, bc - 10:bc + 11]
checks.update(base_site_slope_mean_deg=float(site.mean()), base_site_slope_max_deg=float(site.max()),
              window_slope_p50_deg=float(np.percentile(slope, 50)), window_slope_p95_deg=float(np.percentile(slope, 95)))

# ---------- write outputs ----------
def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
files = {}
def put(name, writer):
    p = os.path.join(OUT, name); writer(p); files[name] = dict(bytes=os.path.getsize(p), sha256=sha(p))
dtm_info = {}
def put_dtm(key, name, arr):  # 16-bit grid for the web build (elevation_m = offset_m + q * scale_m); the float32 grid is not shipped
    q, off, sc = quantize(arr); put(name, lambda p: q.tofile(p))
    dtm_info[key] = dict(file=name, encoding="uint16 little-endian, row-major; elevation_m = offset_m + q * scale_m", offset_m=off, scale_m=sc,
                         max_abs_error_m=float(np.abs(dequantize(q, off, sc).astype("f8") - arr.astype("<f4").astype("f8")).max()))
put_dtm("near", "hirise_dtm_1m_640.u16", dtm)
put("hirise_ortho_25cm_2560.jpg", lambda p: Image.fromarray(ortho).save(p, quality=90))
put_dtm("far", "ctx_dtm_20m_400.u16", ctx_dtm)
put("ctx_ortho_6m.jpg", lambda p: Image.fromarray(ctx_ortho).save(p, quality=88))
meta = dict(
  generated_by="tools/terrain/extract_jezero.py",
  body="Mars", crs="Equirectangular (lat_ts=0, lon0=0), Mars 2000 Sphere IAU, R=3396190 m; X=R*lon_rad, Y=R*lat_rad (planetocentric, east-positive)",
  vertical="metres relative to MOLA areoid ('MOLAtopography_DeltaGeoid' products)",
  local_frame=dict(origin_waypoint="M20 site 52 drive 7624 (sol 1174)", origin_lon=o["lon"], origin_lat=o["lat"], origin_x_eqc=o["x_eqc"], origin_y_eqc=o["y_eqc"],
                   east_m="(X - origin_x) * cos(origin_lat)", north_m="Y - origin_y", cos_lat0=k,
                   origin_elev_hirise_dtm=o["hirise_dtm_elev"]),
  near=dict(source=SRC["hirise_dtm"], ortho_source=SRC["hirise_ortho"], gsd_m=1.0, ortho_gsd_m=0.25, n=NEAR_M, x_min=near["x_min"], y_max=near["y_max"],
            pixel_is_area=True, nodata_count=nodata_near, ortho_zero_count=ortho_zero, elev_min=float(dtm.min()), elev_max=float(dtm.max()),
            lon_min=math.degrees(near["x_min"] / R_MARS), lon_max=math.degrees((near["x_min"] + NEAR_M) / R_MARS),
            lat_min=math.degrees((near["y_max"] - NEAR_M) / R_MARS), lat_max=math.degrees(near["y_max"] / R_MARS)),
  far=dict(source=SRC["ctx_dtm"], ortho_source=SRC["ctx_ortho"], gsd_m=cinfo["scale"], ortho_gsd_m=coinfo["scale"], n=cinfo["n"], ortho_n=coinfo["n"],
           x_min=cinfo["x_min"], y_max=cinfo["y_max"], nodata_count=nodata_far,
           elev_min=float(ctx_dtm[ctx_dtm > -1e30].min()), elev_max=float(ctx_dtm.max())),
  waypoints_source=SRC["waypoints"], waypoints=pts, checks=checks, files=files,
  credit="HiRISE/CTX DTM & orthomosaics: NASA/JPL-Caltech/University of Arizona/MSSS/USGS Astrogeology (Mars 2020 Terrain Relative Navigation mosaics). Rover localization: NASA/JPL-Caltech.",
)
meta["near"]["dtm"] = dtm_info["near"]; meta["far"]["dtm"] = dtm_info["far"]
json.dump(meta, open(os.path.join(OUT, "terrain.json"), "w"), indent=1)
print(json.dumps(dict(near={k2: v for k2, v in meta["near"].items() if "source" not in k2}, far={k2: v for k2, v in meta["far"].items() if "source" not in k2}, checks=checks, files=files), indent=1))
for p in pts: print(p["sol"], p["site"], p["drive"], round(p["east_m"], 1), round(p["north_m"], 1), p["elev_geoid_m20"], None if p["hirise_dtm_elev"] is None else round(p["hirise_dtm_elev"], 2))
