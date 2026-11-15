// Deterministic close-range material surfaces, not photographs or room projections (drawing code moved here unchanged from habitat-materials.js).
// No three.js and no DOM: the same code runs in a worker (OffscreenCanvas) or on the page. `createCanvas(size)` supplies the canvas.
function rng(seed) {  let a = seed >>> 0;  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };}

export async function drawHabitatSurfaces(createCanvas, pause = async () => {}) {
  function surface(size, seed, rgb, amplitude, finish, color = true) {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d'), random = rng(seed), pixels = ctx.createImageData(size, size);
    for (let p = 0; p < pixels.data.length; p += 4) {
      const grain = (random() + random() - 1) * amplitude;
      pixels.data[p] = rgb[0] + grain; pixels.data[p + 1] = rgb[1] + grain; pixels.data[p + 2] = rgb[2] + grain; pixels.data[p + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); finish?.(ctx, random, size);
    return { canvas, color, repeat: true };
  }
  await pause();
  const wall = surface(1024, 34, [218, 214, 204], 7, (c, r, size) => {
    // Very broad discoloration and occasional hairline wear in the enamel finish.
    for (let i = 0; i < 60; i++) {
      const x = r() * size, y = r() * size, radius = 20 + r() * 130;
      const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(75,65,48,${.012 + r() * .04})`); gradient.addColorStop(1, 'rgba(75,65,48,0)');
      c.fillStyle = gradient; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 90; i++) {
      const x = r() * size, y = r() * size; c.strokeStyle = `rgba(92,85,73,${.03 + r() * .09})`; c.lineWidth = .4 + r() * .5;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4 + r() * 28, y + (r() - .5) * 3); c.stroke();
    }
  });
  await pause();
  const wallRough = surface(512, 35, [211, 211, 211], 20, null, false);
  // Each sheet has its own finish; localized edge accumulation gives the panels
  // scale and construction without painting fake room depth into the texture.
  const panels = [0, 1, 2, 3].map((index) => surface(1024, 210 + index, [223 + index * 2, 219 + index, 209 + index], 5, (c, r, size) => {
    for (let edge = 0; edge < 4; edge++) {
      c.save(); c.translate(size / 2, size / 2); c.rotate(edge * Math.PI / 2); c.translate(-size / 2, -size / 2);
      const gradient = c.createLinearGradient(0, 0, 32 + r() * 26, 0);
      gradient.addColorStop(0, 'rgba(68,58,44,.23)'); gradient.addColorStop(.20, 'rgba(80,68,50,.08)'); gradient.addColorStop(1, 'rgba(80,68,50,0)');
      c.fillStyle = gradient; c.fillRect(0, 0, 64, size);
      for (let j = 0; j < 25; j++) {
        const y = r() * size; c.strokeStyle = `rgba(137,133,119,${.08 + r() * .2})`; c.lineWidth = .6 + r();
        c.beginPath(); c.moveTo(3 + r() * 3, y); c.lineTo(3 + r() * 4, y + 2 + r() * 14); c.stroke();
      }
      c.restore();
    }
    for (let i = 0; i < 70; i++) {
      const x = r() * size, y = r() * size, radius = 15 + r() * 145;
      const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(74,65,48,${.007 + r() * .018})`); gradient.addColorStop(1, 'rgba(74,65,48,0)');
      c.fillStyle = gradient; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 120; i++) {
      const x = r() * size, y = r() * size; c.strokeStyle = `rgba(87,80,64,${.04 + r() * .09})`; c.lineWidth = .45;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3 + r() * 24, y + (r() - .5) * 4); c.stroke();
    }
  }));
  await pause();
  const metal = surface(1024, 72, [194, 192, 185], 9, (c, r, size) => {
    for (let i = 0; i < 4400; i++) {
      c.strokeStyle = i % 2 ? `rgba(255,255,247,${.025 + r() * .08})` : `rgba(49,49,45,${.018 + r() * .045})`;
      const x = r() * size, y = r() * size; c.lineWidth = .45;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 12 + r() * 160, y + (r() - .5) * .5); c.stroke();
    }
    for (let i = 0; i < 25; i++) {
      c.strokeStyle = 'rgba(75,71,65,.11)'; c.lineWidth = .6;
      const x = r() * size, y = r() * size; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 35 + r() * 100, y + (r() - .5) * 35); c.stroke();
    }
  });
  await pause();
  const metalRough = surface(512, 73, [164, 164, 164], 32, (c, r, size) => {
    // Handling marks and polishing patches change reflections over centimetres.
    for (let i = 0; i < 35; i++) {
      const x = r() * size, y = r() * size, radius = 20 + r() * 90, dark = i % 2;
      const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, dark ? 'rgba(30,30,30,.25)' : 'rgba(255,255,255,.22)'); gradient.addColorStop(1, dark ? 'rgba(30,30,30,0)' : 'rgba(255,255,255,0)');
      c.fillStyle = gradient; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 1200; i++) { c.fillStyle = `rgba(50,50,50,${r() * .10})`; c.fillRect(0, r() * size, size, .5); }
  }, false);
  // A metre-scale work surface: shallow abrasion and handling marks, without
  // stretching the same cloudy reflection over a seven-metre workbench.
  await pause();
  const worktop = surface(1024, 308, [203, 202, 198], 3, (c, r, size) => {
    for (let i = 0; i < 10000; i++) {
      const x = r() * size, y = r() * size;
      c.strokeStyle = i % 3 ? 'rgba(242,242,234,.045)' : 'rgba(80,82,81,.035)'; c.lineWidth = .5;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 + r() * 110, y + (r() - .5) * .7); c.stroke();
    }
    for (let i = 0; i < 35; i++) {
      const x = r() * size, y = r() * size; c.strokeStyle = 'rgba(92,94,90,.075)'; c.lineWidth = .6;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 + r() * 50, y + (r() - .5) * 25); c.stroke();
    }
  });
  await pause();
  const worktopRough = surface(1024, 309, [184, 184, 184], 7, (c, r, size) => {
    for (let i = 0; i < 100; i++) {
      c.strokeStyle = i % 2 ? 'rgba(230,230,230,.065)' : 'rgba(70,70,70,.055)'; c.lineWidth = 1 + r() * 9;
      const x = r() * size, y = r() * size;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 30, y + 6, x + 80, y - 8, x + 160, y - 3); c.stroke();
    }
  }, false);
  await pause();
  const diffuser = surface(512, 317, [245, 244, 239], 3, (c, r, size) => {
    const gradient = c.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#b8b3a8'); gradient.addColorStop(.055, '#eceae3'); gradient.addColorStop(.2, '#fffefa');
    gradient.addColorStop(.8, '#fffefa'); gradient.addColorStop(.945, '#eceae3'); gradient.addColorStop(1, '#b8b3a8');
    c.fillStyle = gradient; c.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 3) { c.fillStyle = 'rgba(180,177,168,.06)'; c.fillRect(x, 0, .5, size); }
  });
  await pause();
  const acoustic = surface(512, 91, [83, 80, 76], 34, (c, r, size) => {
    for (let i = 0; i < 13000; i++) {
      const x = r() * size, y = r() * size; c.strokeStyle = i % 2 ? 'rgba(160,154,144,.2)' : 'rgba(18,18,17,.2)'; c.lineWidth = .65;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - .5) * 5, y + 1 + r() * 3); c.stroke();
    }
  });
  await pause();
  const acousticBump = surface(512, 92, [128, 128, 128], 70, null, false);
  const grimeCanvas = createCanvas(64);
  const grimeContext = grimeCanvas.getContext('2d'), grimeGradient = grimeContext.createRadialGradient(32, 32, 5, 32, 32, 30);
  grimeGradient.addColorStop(0, 'rgba(45,37,28,.25)'); grimeGradient.addColorStop(.35, 'rgba(45,37,28,.18)'); grimeGradient.addColorStop(1, 'rgba(45,37,28,0)');
  grimeContext.fillStyle = grimeGradient; grimeContext.fillRect(0, 0, 64, 64);
  const fastenerGrime = { canvas: grimeCanvas, color: true, repeat: false };
  await pause();
  const paper = surface(512, 113, [229, 224, 207], 4, (c) => {
    c.fillStyle = '#46504b'; c.font = '600 18px monospace'; c.fillText('FIELD OPERATIONS / LOG', 34, 45);
    c.font = '10px monospace'; c.fillText('Areographic   /   fictional habitat', 34, 66);
    c.strokeStyle = '#8d95894f'; c.lineWidth = 1;
    for (let y = 96; y < 480; y += 24) { c.beginPath(); c.moveTo(32, y); c.lineTo(480, y); c.stroke(); }
    c.strokeStyle = '#8b655e4f'; c.beginPath(); c.moveTo(60, 86); c.lineTo(60, 480); c.stroke();
  });
  return { wall, panels, wallRough, metal, metalRough, worktop, worktopRough, diffuser, acoustic, acousticBump, fastenerGrime, paper };
}
