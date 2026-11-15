// Capture the control pad's first screen (pad/pad.html, 지도 홈) as the 3D monitor picture shown before the screen is opened.
// usage: node tools/assets/capture_pad_preview.mjs [pad url, default http://127.0.0.1:5173/pad/pad.html] -> public/assets/control/pad-preview.png
// (then: python3 -I -c "from PIL import Image; Image.open('public/assets/control/pad-preview.png').save('public/assets/control/pad-preview.webp', quality=86, method=6)")
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:5173/pad/pad.html';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2500); // map tiles settle
await page.screenshot({ path: 'public/assets/control/pad-preview.png' }); await browser.close();
console.log('saved public/assets/control/pad-preview.png from', url);
