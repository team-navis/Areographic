#!/usr/bin/env python3
"""Decimate one Mars 2020 Navcam ops terrain mesh (PDS, public) beside the route into web-sized files.

Usage:  python3 -I tools/terrain/build_route_mesh.py <dir with m.obj m.png> public/data/workspace
Source: NLG_1176_0771346345M727RAS_N0530130SCAM06176_0A01LLJ01 (NAVCAM_LEFT, sol 1176, rover at site 53 / drive 130).
        Vertices are metres in SITE_FRAME index 53 (+X north, +Y east, +Z down); origin = M20 waypoint site 53 / drive 0.
Output: navcam_1176_s53.bin   float32 N,E,D | float32 u,v (v up) | float32 rim (0 at the mesh boundary .. 1 at >= 0.8 m inside) | uint32 indices
        navcam_1176_s53.jpg   texture (single-band image as published, resized to max 1024, JPEG)
        navcam_1176_s53.json  counts, bounds, layout, hashes
Geometry and image are the published product, decimated by vertex clustering (5 cm cells); triangles with an edge over
0.6 m (stretched across occlusion gaps) are dropped. Single-view stereo: hidden surfaces are missing.
"""
import sys, os, json, hashlib
import numpy as np
from PIL import Image
NAME = 'NLG_1176_0771346345M727RAS_N0530130SCAM06176_0A01LLJ01'; CELL, MAX_EDGE, RIM = 0.05, 0.6, 0.8
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def main(src, out):
    obj, png = os.path.join(src, 'm.obj'), os.path.join(src, 'm.png'); V, VT, FV, FT = [], [], [], []
    for l in open(obj):
        if l.startswith('v '): p = l.split(); V.append((float(p[1]), float(p[2]), float(p[3])))
        elif l.startswith('vt '): p = l.split(); VT.append((float(p[1]), float(p[2])))
        elif l.startswith('f '): c = [x.split('/') for x in l.split()[1:4]]; FV.append([int(x[0]) - 1 for x in c]); FT.append([int(x[1]) - 1 for x in c])
    V, VT, fv, ft = np.array(V), np.array(VT), np.array(FV), np.array(FT); nV0, nF0 = len(V), len(fv)
    uv = np.zeros((len(V), 2)); uv[fv.ravel()] = VT[ft.ravel()]
    e = lambda a, b: np.linalg.norm(V[fv[:, a]] - V[fv[:, b]], axis=1); fv = fv[np.maximum(np.maximum(e(0, 1), e(1, 2)), e(2, 0)) <= MAX_EDGE]
    used = np.unique(fv); key = np.round(V[used] / CELL).astype(np.int64); _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel(); n = inv.max() + 1
    cnt = np.bincount(inv, minlength=n)[:, None]; P = np.zeros((n, 3)); T = np.zeros((n, 2)); np.add.at(P, inv, V[used]); np.add.at(T, inv, uv[used]); P /= cnt; T /= cnt
    remap = np.full(len(V), -1); remap[used] = inv; tri = remap[fv]; tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])]; tri = tri[np.unique(np.sort(tri, axis=1), axis=0, return_index=True)[1]]
    # boundary vertices = ends of edges used by exactly one triangle; rim = horizontal distance to the nearest of them
    ed = np.sort(np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), axis=1); u, c = np.unique(ed, axis=0, return_counts=True); bidx = np.unique(u[c == 1]); B = P[bidx, :2]; rim = np.empty(n)
    for s in range(0, n, 2000): d = np.linalg.norm(P[s:s + 2000, None, :2] - B[None, :, :], axis=2).min(axis=1); rim[s:s + 2000] = np.clip(d / RIM, 0, 1)
    im = Image.open(png).convert('RGB'); k = min(1, 1024 / max(im.size)); im2 = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS); jpg = os.path.join(out, 'navcam_1176_s53.jpg'); im2.save(jpg, quality=84)
    binp = os.path.join(out, 'navcam_1176_s53.bin')
    with open(binp, 'wb') as f: f.write(P.astype('<f4').tobytes()); f.write(T.astype('<f4').tobytes()); f.write(rim.astype('<f4').tobytes()); f.write(tri.astype('<u4').tobytes())
    meta = {'source_id': NAME, 'instrument': 'NAVCAM_LEFT, 2024-06-11T03:07:42.851, rover motion counter (site 53, drive 130)', 'frame': 'SITE_FRAME index 53: +X north, +Y east, +Z down, metres; origin = M20 waypoint site 53 / drive 0', 'site_origin_key': '53_0',
            'bounds_ned_m': {'n': [float(P[:, 0].min()), float(P[:, 0].max())], 'e': [float(P[:, 1].min()), float(P[:, 1].max())], 'd': [float(P[:, 2].min()), float(P[:, 2].max())]}, 'centre_ne_m': [float(P[:, 0].mean()), float(P[:, 1].mean())],
            'decimation': {'method': 'vertex clustering', 'cell_m': CELL, 'dropped_edge_over_m': MAX_EDGE}, 'original': {'vertices': nV0, 'triangles': nF0, 'texture_px': list(im.size)}, 'vertices': int(n), 'triangles': int(len(tri)), 'boundary_vertices': int(len(bidx)),
            'texture': {'file': 'navcam_1176_s53.jpg', 'px': list(im2.size), 'note': 'single-band (grey) image as published; any colour in the scene is a presentation tint'}, 'layout': {'positions_f32': [0, int(n) * 12], 'uv_f32': [int(n) * 12, int(n) * 8], 'rim_f32': [int(n) * 20, int(n) * 4], 'indices_u32': [int(n) * 24, int(len(tri)) * 12]},
            'sha256': {'source_obj': sha(obj), 'source_png': sha(png), 'bin': sha(binp), 'jpg': sha(jpg)}, 'bytes': {'source_obj': os.path.getsize(obj), 'source_png': os.path.getsize(png), 'bin': os.path.getsize(binp), 'jpg': os.path.getsize(jpg)}}
    json.dump(meta, open(os.path.join(out, 'navcam_1176_s53.json'), 'w'), indent=1, ensure_ascii=False); print(json.dumps({k2: meta[k2] for k2 in ('vertices', 'triangles', 'boundary_vertices', 'bounds_ned_m', 'bytes')}))
if __name__ == '__main__': main(sys.argv[1], sys.argv[2])
