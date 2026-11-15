#!/usr/bin/env python3
"""Brand assets from the team logo (pad/assets/logo.png, made by the team with ChatGPT / OpenAI image generation).

usage: python3 -I tools/assets/prepare_brand.py
Writes public/assets/brand/:
  logo.webp        original colours, trimmed to the artwork, 1200 px wide (light backgrounds)
  logo-light.webp  the same with the dark navy lettering and A turned near-white (dark backgrounds: loading, landing, room UI);
                   orange swoosh/star, the blue globe and the dune keep their colours
  mark-64.png / mark-180.png / mark-32.png  the A symbol alone, square, for the favicon and touch icon
Nothing else is redrawn.
"""
import os
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..', '..')
src = os.path.join(root, 'pad', 'assets', 'logo.png'); out = os.path.join(root, 'public', 'assets', 'brand'); os.makedirs(out, exist_ok=True)
im = Image.open(src).convert('RGBA'); im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox())
def fit(img, w): return img.resize((w, round(img.height * w / img.width)), Image.LANCZOS) if img.width > w else img
fit(im, 1200).save(os.path.join(out, 'logo.webp'), 'WEBP', quality=92, method=6, alpha_quality=100)
light = im.copy(); px = light.load()
for y in range(light.height):
    for x in range(light.width):
        r, g, b, a = px[x, y]
        if a and max(r, g, b) < 90 and b >= r: # dark navy ink only (the orange, blue and dune pixels are bright or red-dominant)
            k = min(1.0, (90 - max(r, g, b)) / 30) # ink fully white, only the lightest anti-aliased edge pixels blend
            px[x, y] = (round(r + (244 - r) * k), round(g + (246 - g) * k), round(b + (250 - b) * k), a)
fit(light, 1200).save(os.path.join(out, 'logo-light.webp'), 'WEBP', quality=92, method=6, alpha_quality=100)
# A symbol: left part of the artwork up to the end of the dune, padded to a square
w, h = im.size; mark = im.crop((0, 0, round(w * 0.215), h)); mark = mark.crop(mark.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox())
s = max(mark.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.alpha_composite(mark, ((s - mark.width) // 2, (s - mark.height) // 2))
for n in (32, 64, 180): sq.resize((n, n), Image.LANCZOS).save(os.path.join(out, f'mark-{n}.png'), optimize=True)
print('ok', im.size)
