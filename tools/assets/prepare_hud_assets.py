#!/usr/bin/env python3
"""Prepare the team's HUD design assets for the web build (2026-11-15).

usage: python3 -I tools/assets/prepare_hud_assets.py <mars_hud_assets dir (1x)> <hud_png_assets_3x dir> [out dir]

Two team-supplied kits: a 1x line set (cyan line icons + flat parts) and a 3x glow set (glowing parts, white icons).
For one consistent look the HUD uses the 3x glow parts and the 1x cyan line icons. Each file is only resized to roughly
twice its largest on-screen size (LANCZOS) and saved as WebP with alpha (quality 90); nothing is redrawn or recoloured.
Writes public/assets/hud/*.webp and public/assets/hud/provenance.json (source names, sizes, SHA-256).
"""
import sys, os, json, hashlib
from PIL import Image

one, three = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'hud')
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.endswith(('.png', '.webp')): os.remove(os.path.join(out, f))

# (source kit, source file, published name, max width in px)
PLAN = [
    ('3x', 'ui_panel_info_01.png', 'panel_info_01.png', 560),
    ('3x', 'ui_panel_info_02.png', 'panel_info_02.png', 560),
    ('3x', 'ui_top_bar.png', 'top_bar.png', 1000),
    ('3x', 'ui_bottom_bar.png', 'bottom_bar.png', 1020),
    ('3x', 'ui_compass_arc.png', 'compass_arc.png', 840),
    ('3x', 'ui_arrow_left.png', 'arrow_left.png', 110),
    ('3x', 'ui_arrow_right.png', 'arrow_right.png', 110),
    ('3x', 'ui_arrow_triangle.png', 'arrow_triangle.png', 150),
    ('3x', 'ui_reticle_circle.png', 'reticle_circle.png', 420),
    ('3x', 'ui_path_chevron.png', 'path_chevron.png', 160),
    ('1x', 'icon_oxygen.png', 'icon_oxygen.png', 90),
    ('1x', 'icon_radiation.png', 'icon_radiation.png', 90),
    ('1x', 'icon_mission.png', 'icon_mission.png', 90),
    ('1x', 'icon_pin.png', 'icon_pin.png', 90),
    ('1x', 'icon_camera.png', 'icon_camera.png', 90),
    ('1x', 'icon_voice_memo.png', 'icon_voice_memo.png', 90),
]
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
rec = {'title': 'Areographic HUD design assets', 'supplied': 'team design assets shared in the session on 2026-11-15 (mars_hud_assets.zip = 1x line set, hud_png_assets_3x.zip = 3x glow set)',
       'creator': 'our team, generated with OpenAI image generation (user confirmed 2026-11-15); OpenAI Terms of Use: the user owns the Output, OpenAI assigns its rights to the extent permitted by law', 'processing': 'resized (LANCZOS) to about twice the largest on-screen size, WebP with alpha quality 90 (method 6); no redraw or recolour',
       'unused': ['1x: hud_bottom_toolbar, hud_compass_scale, hud_direction_arrow_left/right, hud_focus_reticle, hud_frame_border, hud_info_panel_01/02, hud_route_chevrons, hud_target_pointer, hud_top_status_panel (3x glow versions used instead), icon_temperature (no temperature readout in the HUD)', '3x: icon_camera, icon_mic, icon_pin (white glow; the 1x cyan line icons are used for one icon style), ui_frame_border (blue visor frame removed on request)'],
       'drawn': {'files': ['icon_target.svg', 'icon_base.svg', 'icon_buddy.svg', 'icon_turnback.svg'], 'note': 'drawn for this project in the kit line style (cyan line, rounded caps) because the kits have no target / base / buddy / turn-back icons; not part of the supplied kits'},
       'files': {}}
for kit, src, name, maxw in PLAN:
    sp = os.path.join(one if kit == '1x' else three, src); im = Image.open(sp).convert('RGBA')
    if im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    name = name[:-4] + '.webp'; dp = os.path.join(out, name); im.save(dp, 'WEBP', quality=90, method=6, alpha_quality=95)
    rec['files'][name] = {'kit': kit, 'source': src, 'source_sha256': sha(sp), 'source_px': list(Image.open(sp).size), 'px': list(im.size), 'bytes': os.path.getsize(dp), 'sha256': sha(dp)}
json.dump(rec, open(os.path.join(out, 'provenance.json'), 'w'), ensure_ascii=False, indent=1)
print(sum(v['bytes'] for v in rec['files'].values()), 'bytes in', len(rec['files']), 'files')
