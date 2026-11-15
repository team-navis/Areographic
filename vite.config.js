import { cpSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Build: the 3D demo (index.html + src/) is bundled by Vite as before. The control pad (pad/, a standalone HTML dashboard kept
 * where its author works on it) is copied as-is into <outDir>/pad so the deployed site serves it at /pad/ (and /pad/pad.html).
 */
function copyPad() {
  let outDir = 'dist', root = process.cwd();
  return {
    name: 'copy-control-pad',
    apply: 'build',
    configResolved(c) { root = c.root; outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const src = resolve(root, 'pad'); if (!existsSync(src)) return;
      const dst = resolve(outDir, 'pad');
      cpSync(src, dst, { recursive: true, filter: (p) => !/(\.DS_Store|nohup\.out|\.gitignore)$/.test(p) });
      copyFileSync(resolve(dst, 'pad.html'), resolve(dst, 'index.html')); // /pad/ opens the dashboard too
    },
  };
}

export default { plugins: [copyPad()] };
