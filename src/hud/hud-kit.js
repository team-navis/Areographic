/**
 * HUD design kit (team design assets, 2026-11-15; files in public/assets/hud, record in provenance.json).
 * One consistent look over the whole HUD: chamfered glow panels, top/bottom bars, a compass arc,
 * glow arrows and the reticle from the 3x kit, and the cyan line icons from the 1x kit.
 * Applied without rewriting the teammate's src/hud/hud.js: this module swaps a few entries of its exported ICON map
 * (it must be imported before createHud runs) and hud-kit.css restyles the existing elements. Alert colours keep their meaning.
 */
import { ICON } from './hud.js';
import { assetUrl } from '../util/asset-url.js';
import './hud-kit.css';

export const KIT = assetUrl('/assets/hud/');
export const kitImg = (name, cls = '', ext = 'webp') => `<img class="hk-ic${cls ? ' ' + cls : ''}" src="${KIT}${name}.${ext}" alt="" aria-hidden="true" draggable="false" />`;

Object.assign(ICON, {
  pulse: kitImg('icon_oxygen'),          // LIFE SUPPORT
  rad: kitImg('icon_radiation'),         // RADIATION
  pin: kitImg('icon_pin'),               // NAVIGATION header, route legend, NEXT WP marker
  arrow: kitImg('arrow_triangle', 'hk-arrow'), // navigation arrow (rotated by hud.js toward the route)
  // the kits have no target / base / buddy / turn-back icons: drawn for this project in the kit line style (public/assets/hud/*.svg)
  flag: kitImg('icon_target', '', 'svg'), home: kitImg('icon_base', '', 'svg'), buddy: kitImg('icon_buddy', '', 'svg'), turn: kitImg('icon_turnback', '', 'svg'),
});

/** Called once by field-hud.js after the HUD exists: kit class and the mission icon. (The kit's blue visor frame is not used: removed on request.) */
export function applyKit(el) {
  el.classList.add('kit');
  { const bc = el.querySelector('.hud-bc'); if (bc && !bc.querySelector('.hk-ai')) bc.insertAdjacentHTML('beforeend', '<div class="hk-ai">HUD artwork: AI-generated · panels, bars, icons: OpenAI image generation · 4 line icons: Claude</div>'); } // visible disclosure for the generated HUD assets (shared label, pending GO Team clarification)
  const b = el.querySelector('#hud-base'); if (b && !el.querySelector('.hk-basearrow')) b.insertAdjacentHTML('beforebegin', kitImg('arrow_triangle', 'hk-arrow hk-basearrow')); // direction to the base, turned by field-hud.js with the head
  const m = el.querySelector('#hud-status .en'); if (m && !m.previousElementSibling?.classList?.contains('hk-ic')) m.insertAdjacentHTML('beforebegin', kitImg('icon_mission'));
}
