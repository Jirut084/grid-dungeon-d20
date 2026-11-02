// บอททดสอบ M2: ทั้งสองฮีโร่ใช้ AI เล่นแต่ละห้องหลายรอบ แล้ววัดตามตาราง "การทดสอบ" ใน GDD-MVP
// รัน: node game/test/bot.js [รอบต่อห้อง=100]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoom } from '../src/room.js';
import { createGame, step } from '../src/sim.js';

const N = +process.argv[2] || 100, DT = 1 / 60, LIMIT = 180;
const ROOMS = ['R0', 'R1', 'R2a', 'R2b', 'R4'];
const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = x => (100 * x).toFixed(1) + '%';

const rows = [], total = { in: 0, n: 0 };
for (const id of ROOMS) {
  const room = parseRoom(readFileSync(new URL(`../../tools/rooms/${id}.txt`, import.meta.url), 'utf8'));
  for (const ctrl of [0, 1]) {
    const r = { clear: 0, time: [], lost: [], dodge: [], trust: [], in: 0, n: 0 };
    for (let i = 0; i < N; i++) {
      const g = createGame(room, { seed: i + 1, roomId: id });
      g.ctrl = ctrl;
      g.autopilot = true;
      while (g.state === 'play' && !g.rs.cleared && g.t < LIMIT) step(g, g.modal ? { choose: 0 } : {}, DT);   // การ์ดเลเวลอัป: เลือกใบแรก
      if (g.rs.cleared) { r.clear++; r.time.push(g.stats.clearT); }
      r.lost.push(g.stats.lost);
      if (g.stats.warned) r.dodge.push(1 - g.stats.hit / g.stats.warned);
      r.trust.push(g.trust);
      const ai = g.stats.ai[1 - ctrl];   // คู่หู = ตัวที่ผู้เล่นไม่ได้คุม
      r.in += ai.in; r.n += ai.n;
    }
    total.in += r.in; total.n += r.n;
    rows.push({
      room: id, player: ctrl ? 'Atez' : 'York', clear: pct(r.clear / N), 'time(s)': avg(r.time).toFixed(0),
      'York HP lost': avg(r.lost).toFixed(0), 'dodged': pct(avg(r.dodge)), trust: avg(r.trust).toFixed(0),
      'AI in danger': pct(r.n ? r.in / r.n : 0),
    });
  }
}
console.table(rows);
console.log(`AI คู่หูยืนในช่องเตือนตอนท่าทำงาน: ${pct(total.in / total.n)} (เป้า < 5%) จาก ${total.n} ครั้ง`);
assert.ok(total.in / total.n < 0.05, 'AI stands in telegraphs too often');
