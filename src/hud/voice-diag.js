/**
 * Voice input diagnostics (joint demo feedback 2026-11-15). The crew is assumed unable to type, so the normal flow is buttons + voice.
 * When recognition fails, the HUD names the cause instead of a generic "failed":
 *   1. the browser has no Web Speech recognition,
 *   2. the page is not a secure context (plain http on a LAN address: browsers block the microphone; localhost or HTTPS is needed),
 *   3. microphone permission (Permissions API state, when the browser exposes it),
 *   4. what the recognizer actually did (start / audio / speech / result / nomatch / error code / end).
 * Nothing here pretends a recognition happened. The typed command field is a review tool only (URL ?review).
 */
export const REVIEW = typeof location !== 'undefined' && new URLSearchParams(location.search).has('review');
export const diag = { events: [], last: null, result: null, error: null, permission: 'unknown' }; // inspected by the browser checks (window.__mw.voiceDiag)

export function voiceEnv() {
  const ctor = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null;
  return { ctor, supported: !!ctor, secure: typeof window !== 'undefined' ? !!window.isSecureContext : false, origin: typeof location !== 'undefined' ? `${location.protocol}//${location.host}` : '' };
}

/** Why voice cannot work here at all, or null when it may work. */
export function envReason(env = voiceEnv()) {
  if (!env.supported) return 'This browser has no speech recognition (use Chrome, Edge or Safari)';
  if (!env.secure) return `Not a secure connection (${env.origin}) · the browser blocks the microphone · open on localhost or HTTPS`;
  if (diag.permission === 'denied') return 'Microphone permission denied · allow the microphone in the site settings';
  return null;
}

const ERR = {
  'not-allowed': 'Microphone permission denied (or not a secure connection)',
  'service-not-allowed': 'Browser blocked the speech recognition service',
  'audio-capture': 'No microphone found',
  'no-speech': 'No speech detected',
  network: 'Could not reach the speech recognition server (network)',
  aborted: 'Recognition aborted',
  'language-not-supported': 'English recognition not supported',
  'bad-grammar': 'Recognition setup error',
};
export const errorReason = (code) => ERR[code] || `Unknown error (${code})`;

/** Ask once for the permission state (not every browser supports the 'microphone' name). */
export async function refreshPermission() {
  try { const r = await navigator.permissions.query({ name: 'microphone' }); diag.permission = r.state; r.onchange = () => { diag.permission = r.state; }; } catch { diag.permission = 'unknown'; }
  return diag.permission;
}

/**
 * Start one push-to-talk recognition with event logging. `on.result(text)` gets a real transcript; `on.state(text)` gets a status line.
 * Returns the recognizer, or null when it cannot start (the reason is passed to on.state).
 */
export function startRecognition(on) {
  const env = voiceEnv(), why = envReason(env); diag.result = null; diag.error = null;
  const log = (e) => { diag.last = e; diag.events.push({ e, t: Date.now() }); if (diag.events.length > 40) diag.events.shift(); };
  if (why) { log('blocked'); on.state(`Voice unavailable · ${why}`); return null; }
  let rec;
  try {
    rec = new env.ctor(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onstart = () => { log('start'); on.state('Listening · browser speech recognition (may send audio to an external service) · in-suit performance not verified'); };
    rec.onaudiostart = () => log('audiostart');
    rec.onspeechstart = () => { log('speechstart'); on.state('Speech detected · recognizing'); };
    rec.onresult = (e) => { log('result'); const text = [...e.results].map((r) => r[0].transcript).join(' ').trim(); diag.result = text; on.result(text); };
    rec.onnomatch = () => { log('nomatch'); on.state('Speech heard but not recognized · say it again or use the buttons'); };
    rec.onerror = (e) => { log('error:' + e.error); diag.error = e.error; on.state(`Speech recognition failed · ${errorReason(e.error)} · you can continue with the buttons`); };
    rec.onend = () => { log('end'); if (diag.result === null && diag.error === null) on.state('No result · hold the key while speaking, then release · the buttons also work'); if (on.end) on.end(); };
    rec.start(); log('requested');
  } catch (err) { log('throw'); on.state(`Could not start speech recognition (${String(err && err.message || err).slice(0, 60)}) · you can continue with the buttons`); return null; }
  return rec;
}
