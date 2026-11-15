/**
 * Small fixed Korean command grammar for the HUD (feature definition v0.2, HUD #13 "입력: 음성 명령, 물리 버튼 2개").
 * No language model, no free-form understanding: a transcript is matched against the keyword table below, first hit wins.
 * Recognition itself is the browser's Web Speech API (may send audio to an external service; performance in a suit is
 * unverified). When it is missing or fails, the HUD names the cause (voice-diag.js) and the buttons keep working; a typed field exists only for review (?review).
 */
import { OBS_ITEMS } from '../state/field-ops.js';

// order matters: longer / more specific keywords first ("불일치" before "일치", "못 봄" before "봄")
const TABLE = [
  ['mismatch', ['불일치']], ['match', ['일치']],
  ['interest', ['관심지점', '관심']],
  ['answer:not_seen', ['못봄', '못봤', '안보임', '안보여']], ['answer:undetermined', ['판단불가', '불가', '모름', '불확실']], ['answer:seen', ['봄', '보임', '보여', '봤']],
  ['sample', ['시료기록', '시료', '기록']], ['photo', ['촬영', '마킹']], // no '메모' command: memos are dictated with the suit memo button (4) only
  ['board', ['관찰대조', '관찰리스트', '관찰']], ['compare', ['현장대조', '대조', '투영']], ['list', ['작업목록', '목록']],
  ['return', ['복귀']], ['continue', ['계속', '지속']],
  ['map', ['지도', '미니맵']], ['detail', ['상세']],
  ['next', ['다음']], ['prev', ['이전']], ['confirm', ['확인', '실행', '선택']], ['cancel', ['취소', '닫기', '닫아']],
  ['rover', ['탑승', '하차']], ['auto', ['자동진행', '자동']], ['manual', ['직접조작', '수동', '정지']], ['help', ['도움말', '명령']],
];
export const GRAMMAR_HINT = '다음 · 이전 · 확인 · 취소 · 지도 · 상세 · 대조 · 일치 · 불일치 · 관찰 · 봄 · 못 봄 · 판단 불가 · 기록 · 촬영 · 관심 지점 · 복귀 · 계속 · 자동 · 수동';

/** @returns {{ cmd: string, answer?: string, item?: string, rest: string, heard: string } | null} */
export function parseCommand(text) {
  const heard = String(text || '').trim(), flat = heard.replace(/[\s.,!?·]/g, ''); if (!flat) return null;
  let best = null; // earliest keyword in the utterance wins; ties go to table order
  for (const [id, words] of TABLE) for (const w of words) { const at = flat.indexOf(w); if (at >= 0 && (!best || at < best.at)) best = { id, w, at }; }
  if (best) { const { id, w, at } = best;
    // free text after the keyword (dictated note), cut from the original string so spaces survive
    let rest = ''; { let seen = 0, i = 0; for (; i < heard.length && seen < at + w.length; i++) if (!/[\s.,!?·]/.test(heard[i])) seen++; rest = heard.slice(i).trim(); }
    if (id.startsWith('answer:')) { const it = OBS_ITEMS.find((o) => flat.includes(o.name.replace(/\s/g, ''))); return { cmd: 'answer', answer: id.slice(7), item: it ? it.id : undefined, rest, heard }; }
    return { cmd: id, rest, heard };
  }
  return { cmd: 'unknown', rest: '', heard };
}
