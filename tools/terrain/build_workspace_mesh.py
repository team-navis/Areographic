#!/usr/bin/env python3
"""Crop + decimate the sol 1215 front-Hazcam workspace mesh (PDS, public) into web-sized files.

Usage:  python3 -I tools/terrain/build_workspace_mesh.py <cache_dir_with_obj_png> public/data/workspace
Input:  FLF_1215_0774815107M492RAS_N0560000FHAZ02008_0A0095J01.obj / .png  (Mars 2020 Hazcam ops mesh, sol 1215)
        vertices are metres in SITE_FRAME index 56 (+X north, +Y east, +Z down); origin = rover position at site 56 / drive 0.
Output: fhaz_1215_workspace.bin   float32 N,E,D per vertex | float32 u,v per vertex | uint32 triangle indices
        fhaz_1215_workspace.jpg   texture cropped to the kept faces' UV box, resized (max side 2048), JPEG
        fhaz_1215_workspace.json  counts, crop, texture box, estimated sampling points snapped to the mesh
Nothing is invented: geometry and texture are the published product, cropped to a radius around the workspace and
decimated by vertex clustering (cell 8 mm inside 0.75 m, 20 mm outside). The mesh is single-view stereo, so surfaces the
left front Hazcam could not see are missing.
"""
import sys, os, json, math, hashlib, struct
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
NAME = 'FLF_1215_0774815107M492RAS_N0560000FHAZ02008_0A0095J01'
CENTRE = (-0.555, -2.295)   # N, E (m): midway between the two estimated sampling points below
RADIUS, FINE_R, FINE, COARSE = 1.5, 0.75, 0.008, 0.02
# Estimates from raw WATSON camera metadata (NOT official target coordinates): N, E, D in SITE_FRAME 56
# A: SIF_1217_0774993507_945EBY_N0560000SRLC02503_0000LMJ, B: SIF_1212_0774536492_390EBY_N0560000SRLC08048_0000LMJ
# (Mars 2020 raw images feed metadata, camera position + pointing, assumed standoff 4.5 / 6.5 cm; see public/data/reference/SOURCES.json)
POINTS = {'A': {'name': 'Apollo Temple abrasion patch', 'ned': (-0.50, -2.24, 0.13)}, 'B': {'name': 'Cheyava Falls natural target / Sapphire Canyon core area', 'ned': (-0.61, -2.35, 0.18)}}

def sha(p):
    h = hashlib.sha256(); h.update(open(p, 'rb').read()); return h.hexdigest()

def main(cache, out):
    os.makedirs(out, exist_ok=True); obj = os.path.join(cache, NAME + '.obj'); png = os.path.join(cache, NAME + '.png')
    V, VT, F = [], [], []
    for l in open(obj):
        if l.startswith('v '): p = l.split(); V.append((float(p[1]), float(p[2]), float(p[3])))
        elif l.startswith('vt '): p = l.split(); VT.append((float(p[1]), float(p[2])))
        elif l.startswith('f '): p = l.split()[1:4]; F.append([tuple(int(k) - 1 for k in c.split('/')[:2]) for c in p])
    V = np.array(V); VT = np.array(VT); nV0, nF0 = len(V), len(F)
    fv = np.array([[c[0] for c in f] for f in F]); ft = np.array([[c[1] for c in f] for f in F])
    uv = np.zeros((len(V), 2)); uv[fv.ravel()] = VT[ft.ravel()]            # one view -> one uv per vertex
    r = np.hypot(V[:, 0] - CENTRE[0], V[:, 1] - CENTRE[1]); keepF = (r[fv] < RADIUS).all(axis=1); fv = fv[keepF]
    cell = np.where(r < FINE_R, FINE, COARSE); key = np.concatenate([np.round(V / cell[:, None]).astype(np.int64), (cell[:, None] * 1000).astype(np.int64)], axis=1)
    used = np.unique(fv); _, inv = np.unique(key[used], axis=0, return_inverse=True); inv = inv.ravel(); n = inv.max() + 1
    cnt = np.bincount(inv, minlength=n)[:, None]; P = np.zeros((n, 3)); T = np.zeros((n, 2)); np.add.at(P, inv, V[used]); np.add.at(T, inv, uv[used]); P /= cnt; T /= cnt
    remap = np.full(len(V), -1); remap[used] = inv; tri = remap[fv]; ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2]); tri = tri[ok]
    tri = tri[np.unique(np.sort(tri, axis=1), axis=0, return_index=True)[1]]
    # texture: crop to the UV box of what is kept (OBJ v runs bottom-up), resize, re-map uv into the crop
    im = Image.open(png).convert('RGB'); W, H = im.size; pad = 0.004
    u0, u1 = max(0, T[:, 0].min() - pad), min(1, T[:, 0].max() + pad); v0, v1 = max(0, T[:, 1].min() - pad), min(1, T[:, 1].max() + pad)
    box = (int(u0 * W), int((1 - v1) * H), int(math.ceil(u1 * W)), int(math.ceil((1 - v0) * H))); crop = im.crop(box); k = min(1, 2048 / max(crop.size))
    crop = crop.resize((round(crop.size[0] * k), round(crop.size[1] * k)), Image.LANCZOS); jpg = os.path.join(out, 'fhaz_1215_workspace.jpg'); crop.save(jpg, quality=86)
    T2 = np.stack([(T[:, 0] * W - box[0]) / (box[2] - box[0]), 1 - ((1 - T[:, 1]) * H - box[1]) / (box[3] - box[1])], axis=1)   # u right, v UP (three.js flipY convention)
    binp = os.path.join(out, 'fhaz_1215_workspace.bin')
    with open(binp, 'wb') as f: f.write(P.astype('<f4').tobytes()); f.write(T2.astype('<f4').tobytes()); f.write(tri.astype('<u4').tobytes())
    pts = {}
    for k_, p in POINTS.items():
        d = np.hypot(P[:, 0] - p['ned'][0], P[:, 1] - p['ned'][1]); i = int(d.argmin())
        pts[k_] = {'name': p['name'], 'estimate_ned_m': p['ned'], 'basis': 'computed from raw WATSON camera metadata; not an official target coordinate', 'snapped_vertex_ned_m': [round(float(x), 4) for x in P[i]], 'horizontal_snap_m': round(float(d[i]), 4), 'mesh_minus_estimate_down_m': round(float(P[i, 2] - p['ned'][2]), 4), 'uv': [round(float(T2[i, 0]), 5), round(float(T2[i, 1]), 5)]}
    # Marker A: if the texture shows the bright abrasion patch near the estimate, snap to its centroid (brightest 2 % within 6 cm)
    g = np.asarray(crop.convert('L'), dtype=float); a = pts['A']; cx, cy = a['uv'][0] * crop.size[0], (1 - a['uv'][1]) * crop.size[1]; near = np.hypot(P[:, 0] - a['snapped_vertex_ned_m'][0], P[:, 1] - a['snapped_vertex_ned_m'][1]) < 0.06
    px = np.stack([T2[near, 0] * crop.size[0], (1 - T2[near, 1]) * crop.size[1]], axis=1); rad = float(np.hypot(px[:, 0] - cx, px[:, 1] - cy).max()); yy, xx = np.mgrid[0:g.shape[0], 0:g.shape[1]]; win = np.hypot(xx - cx, yy - cy) <= rad
    thr = np.percentile(g[win], 98); sel = win & (g >= thr); bx, by = float(xx[sel].mean()), float(yy[sel].mean()); contrast = float(g[sel].mean() - np.median(g[win]))
    if contrast > 40:
        j = int(np.hypot(T2[:, 0] * crop.size[0] - bx, (1 - T2[:, 1]) * crop.size[1] - by).argmin()); a.update({'texture_snap': {'method': 'centroid of the brightest 2 % of texture pixels within 6 cm of the estimate', 'contrast_dn': round(contrast, 1), 'vertex_ned_m': [round(float(x), 4) for x in P[j]], 'uv': [round(float(T2[j, 0]), 5), round(float(T2[j, 1]), 5)], 'moved_m': round(float(np.linalg.norm(P[j] - np.array(a['snapped_vertex_ned_m']))), 4)}})
    rr = np.hypot(P[:, 0] - CENTRE[0], P[:, 1] - CENTRE[1]) <= 0.62; region = {'u0': float(T2[rr, 0].min()), 'u1': float(T2[rr, 0].max()), 'v0': float((1 - T2[rr, 1]).min()), 'v1': float((1 - T2[rr, 1]).max())}  # image box (v down) of the rock, for the PAD line filter
    meta = {'source_id': NAME, 'frame': 'SITE_FRAME index 56: +X north, +Y east, +Z down, metres; origin = rover position at site 56 / drive 0', 'crop': {'centre_ne_m': CENTRE, 'radius_m': RADIUS}, 'decimation': {'method': 'vertex clustering', 'cell_m_inside': FINE, 'inside_radius_m': FINE_R, 'cell_m_outside': COARSE},
            'original': {'vertices': nV0, 'triangles': nF0, 'texture_px': [W, H]}, 'vertices': int(n), 'triangles': int(len(tri)), 'texture': {'file': 'fhaz_1215_workspace.jpg', 'px': list(crop.size), 'source_box_px': list(box)}, 'rock_region_image': region, 'layout': {'positions_f32': [0, int(n) * 12], 'uv_f32': [int(n) * 12, int(n) * 8], 'indices_u32': [int(n) * 20, int(len(tri)) * 12]}, 'points': pts,
            'sha256': {'source_obj': sha(obj), 'source_png': sha(png), 'bin': sha(binp), 'jpg': sha(jpg)}, 'bytes': {'source_obj': os.path.getsize(obj), 'source_png': os.path.getsize(png), 'bin': os.path.getsize(binp), 'jpg': os.path.getsize(jpg)}}
    json.dump(meta, open(os.path.join(out, 'fhaz_1215_workspace.json'), 'w'), indent=1, ensure_ascii=False); print(json.dumps({k: meta[k] for k in ('vertices', 'triangles', 'texture', 'bytes', 'points')}, ensure_ascii=False, indent=1))

if __name__ == '__main__': main(sys.argv[1], sys.argv[2])
