/**
 * Small fixed English command grammar for the HUD (feature definition v0.2, HUD #13 "input: voice commands, 2 physical buttons").
 * No language model, no free-form understanding: a transcript is matched against the keyword table below, first hit wins.
 * Recognition itself is the browser's Web Speech API (may send audio to an external service; performance in a suit is
 * unverified). When it is missing or fails, the HUD names the cause (voice-diag.js) and the buttons keep working; a typed field exists only for review (?review).
 */
import { OBS_ITEMS } from '../state/field-ops.js';

// order matters: longer / more specific phrases first ("no match" before "match", "not seen" before "seen")
const TABLE = [
  ['mismatch', ['no match', 'mismatch']], ['match', ['match']],
  ['interest', ['point of interest', 'interest']],
  ['answer:not_seen', ['not seen']], ['answer:undetermined', ["can't tell", 'cannot tell', 'unsure']], ['answer:seen', ['seen', 'yes']],
  ['sample', ['sample']], ['photo', ['photo', 'picture']], // no 'memo' command: memos are dictated with the suit memo button (4) only
  ['board', ['observation', 'checklist']], ['compare', ['pov', 'compare']], ['list', ['task list', 'list']],
  ['return', ['return']], ['continue', ['continue']],
  ['map', ['map']], ['detail', ['detail']],
  ['next', ['next']], ['prev', ['previous', 'back']], ['confirm', ['confirm', 'select', 'ok']], ['cancel', ['cancel', 'close']],
  ['rover', ['board', 'get off', 'rover']], ['auto', ['auto']], ['manual', ['manual', 'stop']], ['help', ['help']],
];
export const GRAMMAR_HINT = 'next · previous · confirm · cancel · map · detail · compare · match · no match · observation · seen · not seen · can\'t tell · sample · photo · point of interest · return · continue · auto · manual';

const SEP = '[\\s.,!?·-]+';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// case-insensitive, whole words only, any run of spaces / punctuation between the words of a phrase
const RX = TABLE.map(([id, words]) => [id, words.map((w) => [w, new RegExp(`(?<![a-z0-9'])${w.split(' ').map(esc).join(SEP)}(?![a-z0-9'])`, 'i')])]);
const flatOf = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** @returns {{ cmd: string, answer?: string, item?: string, rest: string, heard: string } | null} */
export function parseCommand(text) {
  const heard = String(text || '').trim().replace(/[‘’]/g, "'"); if (!heard.replace(/[\s.,!?·]/g, '')) return null;
  let best = null; // earliest keyword in the utterance wins; ties go to table order
  for (const [id, words] of RX) for (const [w, rx] of words) { const m = rx.exec(heard); if (m && (!best || m.index < best.at)) best = { id, w, at: m.index, len: m[0].length }; }
  if (best) { const { id, at, len } = best;
    // free text after the keyword (dictated note), cut from the original string so spaces survive
    const rest = heard.slice(at + len).replace(/^[\s.,!?·-]+/, '').trim();
    if (id.startsWith('answer:')) { const flat = flatOf(heard); const it = OBS_ITEMS.find((o) => flat.includes(flatOf(o.name).replace(/s$/, ''))); return { cmd: 'answer', answer: id.slice(7), item: it ? it.id : undefined, rest, heard }; }
    return { cmd: id, rest, heard };
  }
  return { cmd: 'unknown', rest: '', heard };
}
