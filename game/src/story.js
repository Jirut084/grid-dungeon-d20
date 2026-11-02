// ฉากเผชิญหน้าและฉากจบ A–D (GDD หมวด 8–9) · บทพูดเป็น key ใน strings.json (scene.<ฉาก>.<บรรทัด>)
import { CONFRONT, ENDINGS, RELICS } from './data.js';
import { openModal, gainTrust, d } from './sim.js';

const LINES = {
  open: ['dm', 'york', 'york', 'york', 'dm', 'york', 'york'],
  confess: ['atez', 'atez', 'atez', 'atez'],
  A: ['dm', 'york', 'york', 'york', 'atez', 'york', 'dm', 'york', 'york', 'atez'],
  Blie: ['atez', 'atez'],
  Bsilent: ['dm'],
  B: ['york', 'atez', 'york', 'york', 'dm', 'atez'],
  C: ['atez', 'york', 'york', 'york', 'dm', 'york', 'atez', 'york', 'dm', 'york', 'york', 'atez'],
  D: ['dm', 'york', 'york', 'york', 'atez', 'york', 'york', 'dm', 'atez', 'dm'],
};
const lines = k => LINES[k].map((who, i) => [who, `scene.${k}.${i + 1}`]);
const scene = (g, ls, then, title) => openModal(g, { kind: 'scene', title, lines: ls, i: 0, then, options: [{ next: true }] });

// หลังชนะบอส: York พบบันทึกหน้าสุดท้ายของ Grand Master แล้วถาม Atez
export function startConfrontation(g) {
  g.journal.notes.push('gmPage');
  scene(g, lines('open'), 'confront', 'scene.title');
}

// ฉากบทพูดเล่นจบ → ขั้นต่อไป
export function afterScene(g, then) {
  if (then === 'confront') {
    if (g.ctrl === 1) return openModal(g, { kind: 'confront', options: [{ pick: 'confess' }, { pick: 'lie' }, { pick: 'silent' }] });
    // เล่นเป็น York: AI Atez เลือกจาก Trust (≥ 70 สารภาพ · 40–69 โกหกและทอย · < 40 เงียบ)
    return decide(g, g.trust >= CONFRONT.aiConfess ? 'confess' : g.trust >= CONFRONT.aiLie ? 'lie' : 'silent');
  }
  if (then === 'forgive') return openModal(g, { kind: 'forgive', options: [{ end: 'A' }, { end: 'D' }] });
  if (then.startsWith('end:')) return ending(g, then.slice(4));
  if (then.startsWith('reward:')) return reward(g, then.slice(7));
}

export function decide(g, pick) {
  // สารภาพ: เล่นเป็น York ผู้เล่นเลือกให้อภัย/แยกทาง · เล่นเป็น Atez York ตัดสินจาก Trust (≥ 50 = A)
  if (pick === 'confess') return scene(g, lines('confess'), g.ctrl === 0 ? 'forgive' : 'end:' + (g.trust >= CONFRONT.forgive ? 'A' : 'D'));
  if (pick === 'silent') { gainTrust(g, 'silent'); return ending(g, 'B', 'silent'); }   // เงียบ = โกหกที่ไม่ต้องทอย
  openModal(g, contest(g, d(g, 20), d(g, 20)));
}

// โกหก: Deception d20+10 แข่ง Insight d20+4 (+5 ถ้า Trust < 40) · เสมอ = โกหกพลาด
export function contest(g, a, y) {
  const insight = CONFRONT.insight + (g.trust < CONFRONT.wary ? CONFRONT.waryBonus : 0);
  const win = a + CONFRONT.deception > y + insight;
  const playerLost = g.ctrl === 1 ? !win : win;   // Lucky ทอยใหม่ได้เฉพาะลูกเต๋าฝั่งผู้เล่น
  return { kind: 'contest', a, y, deception: CONFRONT.deception, insight, win,
    options: [...(playerLost && g.luck > 0 ? [{ reroll: true }] : []), { ok: true }] };
}

export function ending(g, k, variant = 'lie') {
  let ls = k === 'B' ? lines(variant === 'silent' ? 'Bsilent' : 'Blie').concat(lines('B')) : lines(k);
  if (k === 'C' && !g.journal.heard) ls = ls.filter(([, key]) => key !== 'scene.C.4');   // "นางเรียกเจ้าว่าลูก" ต้องเคยได้ยิน
  scene(g, ls, 'reward:' + k, 'ending.' + k);
}

// Relic จากฉากจบ ติดตัวไปทุก run หลังจากนี้ (main.js เก็บลงเครื่อง)
function reward(g, k) {
  g.ending = k;
  for (const id of ENDINGS[k]) openModal(g, { kind: 'loot', relic: id, hero: RELICS[id].who, legacy: true, options: [{ ok: true }] });
  g.state = 'over';
}
