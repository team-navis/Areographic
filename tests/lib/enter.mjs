// Shared entry steps for the browser checks on the integrated build (3D habitat + fixed outdoor route).
// Product input only: role button -> indoor free walk (WASD) -> airlock exit -> HUD. `look.yaw` is set through the
// debug handle so the walk is deterministic; position is never set by a hook here.
export const mode = (page, m, timeout = 30000) => page.waitForFunction((x) => window.__mw.mode === x, m, { timeout });

/** From the landing screen: enter the habitat as the field crew. Returns once free walking is active. */
export async function enterHabitat(page) {
  await page.evaluate(() => window.__mw.enterRole('hud')); await mode(page, 'habitat');
}

/** Inside the habitat: face west, line up with the airlock doorway (z = 1 m) and walk out with W. Ends in HUD mode on the ramp. */
export async function walkOutThroughAirlock(page) {
  await page.evaluate(() => { window.__mw.look.yaw = Math.PI / 2; window.__mw.look.pitch = 0; });
  // strafe (A = toward +z when facing west) until the capsule is inside the doorway band
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => window.__mw.walk.state.z >= 0.92, null, { timeout: 10000 }); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyW'); await mode(page, 'hud', 40000); await page.keyboard.up('KeyW');
  await page.waitForTimeout(200);
}

/** Landing -> habitat -> airlock -> HUD (first departure). After departure, #btn-hud resumes the HUD directly. */
export async function enterHud(page) {
  const departed = await page.evaluate(() => !window.__mw.mission.st.habitatPose);
  if (departed) { await page.evaluate(() => window.__mw.enterRole('hud')); await mode(page, 'hud', 40000); return; }
  await enterHabitat(page); await walkOutThroughAirlock(page);
}

/** Controller seat: open one of the three 3D monitors with its seat shortcut (1/2/3) and wait for its DOM detail screen. */
export async function openMonitor(page, id = 'planner') {
  await page.keyboard.press({ science: 'Digit1', planner: 'Digit2', systems: 'Digit3' }[id]);
  await page.waitForFunction((x) => window.__mw.activeMonitor === x && !!document.querySelector('#terminal-overlay .terminal-active'), id, { timeout: 15000 });
  await page.waitForTimeout(700); // one live refresh of the monitor (0.5 s cadence)
}
/** Landing -> controller seat -> centre monitor (PAD). */
export async function enterPad(page) { await page.evaluate(() => window.__mw.enterRole('pad')); await mode(page, 'pad'); await openMonitor(page, 'planner'); }
