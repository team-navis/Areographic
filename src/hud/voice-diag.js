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
  if (!env.supported) return '이 브라우저에는 음성 인식 기능이 없습니다 (Chrome·Edge·Safari 필요)';
  if (!env.secure) return `보안 연결이 아닙니다 (${env.origin}) · 브라우저가 마이크를 막습니다 · localhost 또는 HTTPS 주소에서 여세요`;
  if (diag.permission === 'denied') return '마이크 권한이 거부되어 있습니다 · 주소창의 사이트 설정에서 마이크를 허용하세요';
  return null;
}

const ERR = {
  'not-allowed': '마이크 권한 거부 (또는 보안 연결 아님)',
  'service-not-allowed': '브라우저가 음성 인식 서비스를 막음',
  'audio-capture': '마이크를 찾지 못함',
  'no-speech': '말소리를 감지하지 못함',
  network: '음성 인식 서버에 연결하지 못함 (네트워크)',
  aborted: '인식이 중단됨',
  'language-not-supported': '한국어 인식을 지원하지 않음',
  'bad-grammar': '인식 설정 오류',
};
export const errorReason = (code) => ERR[code] || `알 수 없는 오류 (${code})`;

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
  if (why) { log('blocked'); on.state(`음성 불가 · ${why}`); return null; }
  let rec;
  try {
    rec = new env.ctor(); rec.lang = 'ko-KR'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onstart = () => { log('start'); on.state('듣는 중 · 브라우저 음성 인식 (외부 서비스로 전송될 수 있음) · 우주복 환경 성능 미검증'); };
    rec.onaudiostart = () => log('audiostart');
    rec.onspeechstart = () => { log('speechstart'); on.state('말소리 감지 · 인식 중'); };
    rec.onresult = (e) => { log('result'); const text = [...e.results].map((r) => r[0].transcript).join(' ').trim(); diag.result = text; on.result(text); };
    rec.onnomatch = () => { log('nomatch'); on.state('말소리는 들렸지만 인식 결과가 없습니다 · 다시 말하거나 버튼을 쓰세요'); };
    rec.onerror = (e) => { log('error:' + e.error); diag.error = e.error; on.state(`음성 인식 실패 · ${errorReason(e.error)} · 버튼으로 계속할 수 있습니다`); };
    rec.onend = () => { log('end'); if (diag.result === null && diag.error === null) on.state('인식 결과 없음 · 키를 누른 채 말한 뒤 떼세요 · 버튼으로도 계속할 수 있습니다'); if (on.end) on.end(); };
    rec.start(); log('requested');
  } catch (err) { log('throw'); on.state(`음성 인식을 시작하지 못했습니다 (${String(err && err.message || err).slice(0, 60)}) · 버튼으로 계속할 수 있습니다`); return null; }
  return rec;
}
