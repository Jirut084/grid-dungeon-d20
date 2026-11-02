// บอทเล่นทั้ง run: R0 → R6 ผ่านทั้งสองทาง (loop) กดใช้ของทุกอย่าง ชนะบอส ฉากเผชิญหน้า จนจบ run
// เลือกตัวเลือกแบบสุ่ม · แพ้ = DM เล่าห้องใหม่ แล้วเล่นต่อ · ค้างห้องเดิมนานเกิน = บัค (หยุดพร้อมรายละเอียด)
// รัน: node game/test/run.js [จำนวน seed=30] [--new]   (--new = ผู้เล่นใหม่: พลาดไม่หลบช่องเตือน 30% เหมือน balance.py)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoom, charAt, find } from '../src/room.js';
import { createGame, step } from '../src/sim.js';
import { retell, runSummary } from '../src/world.js';
import { LINKS, EVENTS, CHESTS, TARGETS } from '../src/data.js';
import { cheb, active, bfs } from '../src/grid.js';

const N = +process.argv[2] || 30, SLOPPY = process.argv.includes('--new') ? 0.3 : 0, DT = 1 / 60, STUCK = 400;
const IDS = ['R0', 'R1', 'R2a', 'R2b', 'R3', 'R4', 'R5', 'R6'];
const rooms = Object.fromEntries(IDS.map(id => [id, parseRoom(readFileSync(new URL(`../../tools/rooms/${id}.txt`, import.meta.url), 'utf8'))]));
const ROUTE = ['R0', 'R1', 'R2a', 'R3', 'R2b', 'R1', 'R2a', 'R3', 'R4', 'R5', 'R6'];   // วนครบสองทางเพื่อสวดครบ 7 ศพ

const dirTo = (h, [x, y]) => [x - h.x, y - h.y];
// เดินไปหา goal · ไม่มีทาง (คู่หูยืนขวาง) → เดินชนคู่หูเพื่อสลับช่อง
function go(g, me, goal) {
  const s = bfs(g, me.x, me.y, goal), p = g.heroes[1 - g.ctrl];
  if (s) return { dir: dirTo(me, s.first) };
  if (Math.abs(p.x - me.x) + Math.abs(p.y - me.y) === 1) return { dir: dirTo(me, [p.x, p.y]) };
  const t = bfs(g, me.x, me.y, (x, y) => Math.abs(p.x - x) + Math.abs(p.y - y) === 1);
  return t ? { dir: dirTo(me, t.first) } : {};
}

// สิ่งที่ผู้เล่นต้องกด E เอง (สวดให้ AI York ทำ)
function todo(g) {
  for (const ch of ['X', 'c', 'e', 'r']) for (const c of find(g.room, ch)) {
    const k = c.x + ',' + c.y;
    if (ch === 'X' && !g.rs.done[k + 'speak']) return c;
    if ((ch === 'c' && CHESTS[g.roomId] || ch === 'e' && EVENTS[g.roomId] || ch === 'r') && !g.rs.done[k]) return c;
  }
  return null;
}
const unprayed = g => ['K', 'X'].flatMap(ch => find(g.room, ch)).some(c => {
  const k = c.x + ',' + c.y;
  return !g.rs.done[k + 'pray'] && (charAt(g.room, c.x, c.y) === 'K' || g.rs.done[k + 'speak']);
});

function play(seed, ctrl) {
  const g = createGame(rooms, { seed });
  Object.assign(g, { ctrl, sloppy: SLOPPY });
  let leg = 1, press = false, since = 0, retells = 0, rand = seed * 7919;
  const pick = n => (rand = (rand * 16807) % 2147483647) % n;
  while (g.state !== 'over') {
    const me = g.heroes[g.ctrl];
    if (g.roomId === ROUTE[leg]) { leg++; since = g.t; }
    if (g.t - since > STUCK) return { seed, ctrl, stuck: g.roomId, t: g.t, g };
    let inp = {};
    if (g.modal) inp = { choose: pick(g.modal.options.length) };
    else if (g.state === 'fail') { retells++; retell(g); continue; }
    else if (g.enemies.some(e => active(e) || e.kneel) || g.heroes.some(h => h.down)) g.autopilot = true;
    else if (todo(g)) {   // เดินไปติดของแล้วกด E
      g.autopilot = false;
      const c = todo(g);
      inp = cheb(me, c) <= 1 ? { hold: (press = !press) } : go(g, me, (x, y) => cheb({ x, y }, c) <= 1);
    } else if (unprayed(g)) g.autopilot = true;   // AI York สวดเอง
    else {   // ไปประตูของห้องถัดไปแล้วเดินชน
      g.autopilot = false;
      const side = Object.keys(LINKS[g.roomId]).find(s => LINKS[g.roomId][s]?.[0] === ROUTE[leg]);
      const door = find(g.room, 'D').find(d => (d.x === 0 ? 'W' : d.x === g.room.w - 1 ? 'E' : d.y === 0 ? 'N' : 'S') === side);
      inp = Math.abs(door.x - me.x) + Math.abs(door.y - me.y) === 1 ? { dir: dirTo(me, [door.x, door.y]) }
        : go(g, me, (x, y) => Math.abs(door.x - x) + Math.abs(door.y - y) === 1);
    }
    step(g, inp, DT);
  }
  return { seed, ctrl, t: g.t, retells, g, ending: g.ending, level: g.level, prayed: g.prayed, spoken: g.spoken, ...runSummary(g) };
}

const results = [];
for (let s = 1; s <= N; s++) for (const ctrl of [0, 1]) results.push(play(s, ctrl));
const stuck = results.filter(r => r.stuck);
for (const r of stuck) {
  const { g } = r;
  console.log(`STUCK seed ${r.seed} ${r.ctrl ? 'Atez' : 'York'} in ${r.stuck} t=${r.t.toFixed(0)}`,
    g.heroes.map(h => `${h.kind}@${h.x},${h.y} hp${h.hp}${h.down ? ' down' : ''}${h.swallowed ? ' swallowed' : ''}`).join(' '),
    g.enemies.filter(e => active(e) || e.kneel).map(e => `${e.kind}@${e.x},${e.y} hp${Math.round(e.hp)}${e.kneel ? ' kneel' : ''}`).join(' '));
}
const done = results.filter(r => !r.stuck), avg = f => done.reduce((a, r) => a + f(r), 0) / done.length;
console.log(`${SLOPPY ? 'บอทผู้เล่นใหม่' : 'บอทเก่ง'} · จบ run ${done.length}/${results.length} · เล่นจริง ${avg(r => r.t / 60).toFixed(1)} นาที · เล่าใหม่ ${avg(r => r.retells).toFixed(1)} ครั้ง`
  + ` · การ์ด ${avg(r => r.level).toFixed(1)} · สวด ${avg(r => r.prayed).toFixed(1)}/7 · Speak ${avg(r => r.spoken).toFixed(1)}/3`);
const endings = {};
for (const r of done) endings[r.ending] = (endings[r.ending] ?? 0) + 1;
console.log('ฉากจบ:', Object.entries(endings).sort().map(([k, n]) => `${k} ${n}`).join(' · '));
console.table(Object.fromEntries(Object.keys(TARGETS).map(k => {
  const v = avg(r => r[k]), [lo, hi] = TARGETS[k];
  return [k, { avg: +v.toFixed(k === 'dodged' || k === 'aiDanger' ? 3 : 1), target: `${lo}–${hi}`, ok: v >= lo && v <= hi ? '✓' : '✗' }];
})));
assert.equal(stuck.length, 0, 'some runs got stuck');
