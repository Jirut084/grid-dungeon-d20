// พฤติกรรมศัตรูในคฤหาสน์ (GDD-MVP "ศัตรูในคฤหาสน์") — ทุกตัวเล็ง York อย่างเดียว ยกเว้นการกอดที่เล็ง Atez
import { BLOCK_MOVE, BLOCK_SHOT, charAt } from './room.js';
import {
  DIRS, cheb, manhattan, has, active, ready, free, line, around, aligned, toward, bfs, moveTo,
} from './grid.js';
import { windup, bark } from './sim.js';
import { updateBoss, maggot } from './boss.js';
import { hasRelic } from './gear.js';

export function updateEnemy(g, e) {
  const [york, atez] = g.heroes, s = e.s;
  if (e.kind === 'boss') return updateBoss(g, e);
  // การปูทาง (GDD หมวด 9): แม่กระซิบ "ลูก…" เมื่อ Atez เดินผ่าน · York อยู่ในระยะ 3 ช่องได้ยินด้วย (ฉากจบ C ใช้)
  if (e.kind === 'mother' && !g.rs.done.whisper && cheb(e, atez) <= 1) {
    g.rs.done.whisper = true;
    bark(g, 'mother', 'mother.child');
    if (cheb(york, atez) <= 3) g.journal.heard = true;
  }
  if (s.hug) e.near = cheb(e, atez) <= 1 && !atez.down ? e.near + g.dt : 0;   // นับเวลาที่ Atez ยืนติด
  if (e.windup || e.holding || g.t < e.busyTo || g.t < e.stunTo || g.t < e.charmTo) return;   // Charmed (กระดิ่ง): ยืนนิ่ง
  if (g.t < e.fearTo) return stepAway(g, e, atez);                              // Frightened: เดินหนี ไม่โจมตี
  if (s.hug && e.near >= s.hug.near && ready(g, e, 'hug') && !atez.hugger && !atez.down && !hasRelic(atez, 'shawl'))
    return windup(g, e, 'hug', toward(e, atez), around(g, atez, 1), 'ctrl');
  BEHAVIOR[e.kind](g, e, york);
}

function walk(g, e, goal) {
  const next = bfs(g, e.x, e.y, goal)?.first;
  if (!next) { e.busyTo = g.t + 0.2; return; }   // ไม่มีทาง: รอแล้วค่อยหาใหม่
  e.face = [next[0] - e.x, next[1] - e.y];
  moveTo(g, e, next[0], next[1], e.s.move);
  e.busyTo = e.t1;
}

function stepAway(g, e, from) {
  const best = DIRS.map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy }))
    .filter(c => free(g, c.x, c.y))
    .sort((a, b) => manhattan(b, from) - manhattan(a, from))[0];
  if (best && manhattan(best, from) > manhattan(e, from)) walk(g, e, (x, y) => x === best.x && y === best.y);
  else e.busyTo = g.t + 0.2;
}

const uniq = cells => [...new Map(cells.map(c => [c.join(), c])).values()];

const BEHAVIOR = {
  // ฟุตแมน: เดินเข้าหา · ฟาดถาดแถว 3 ช่อง · พุ่งชนเมื่ออยู่แนวเดียวกันห่าง 2–4
  footman(g, e, york) {
    const s = e.s;
    if (cheb(e, york) === 1 && ready(g, e, 'tray')) {
      const [dx, dy] = toward(e, york), front = { x: e.x + dx, y: e.y + dy };
      const cells = [[0, 0], [dy, dx], [-dy, -dx]]          // ช่องหน้า + สองข้าง
        .map(([px, py]) => [front.x + px, front.y + py])
        .filter(([x, y]) => !BLOCK_SHOT.includes(charAt(g.room, x, y)));
      return windup(g, e, 'tray', [dx, dy], cells);
    }
    const dir = aligned(e, york), n = manhattan(e, york);
    if (dir && ready(g, e, 'charge') && n >= s.charge.min && n <= s.charge.max) {
      const cells = line(g, e.x, e.y, dir, s.charge.len, BLOCK_MOVE);
      if (has(cells, york)) return windup(g, e, 'charge', dir, cells);
    }
    if (cheb(e, york) > 1) walk(g, e, (x, y) => cheb({ x, y }, york) === 1);
  },

  // สาวใช้: รักษาระยะ 3–4 ช่องในแนวเดียวกับ York · ขว้างจาน · ถอยหนีเมื่อถูกประชิด
  maid(g, e, york) {
    const s = e.s;
    if (e.flee > 0) { e.flee--; return stepAway(g, e, york); }
    if (cheb(e, york) <= 1 && ready(g, e, 'flee')) {
      e.ready.flee = g.t + s.flee.cd;
      e.flee = s.flee.cells - 1;
      return stepAway(g, e, york);
    }
    const shot = (x, y) => {
      const dir = aligned({ x, y }, york);
      return dir && has(line(g, x, y, dir, s.plate.len, BLOCK_SHOT), york) ? dir : null;
    };
    const dir = shot(e.x, e.y);
    if (dir && ready(g, e, 'plate')) return windup(g, e, 'plate', dir, line(g, e.x, e.y, dir, s.plate.len, BLOCK_SHOT));
    const spot = (x, y) => { const n = manhattan({ x, y }, york); return n >= s.keep[0] && n <= s.keep[1] && shot(x, y); };
    if (!spot(e.x, e.y)) walk(g, e, spot);
  },

  // ญาติชาย / พี่ชาย: แทงพุ่งเส้น 3 ช่อง (ปัดป้องอยู่ใน strike) · ไม่หันตามตอนยืนรอ จึงอ้อมหลังได้
  kinsman(g, e, york) {
    const m = e.s.lunge, dir = aligned(e, york);
    if (dir && manhattan(e, york) <= m.len && ready(g, e, 'lunge')) {
      const cells = line(g, e.x, e.y, dir, m.len, BLOCK_MOVE);
      if (has(cells, york)) { e.chain = m.chain; return windup(g, e, 'lunge', dir, cells); }
    }
    const spot = (x, y) => {
      const d = aligned({ x, y }, york);
      return d && manhattan({ x, y }, york) <= m.len && has(line(g, x, y, d, m.len, BLOCK_MOVE), york);
    };
    if (!spot(e.x, e.y)) walk(g, e, spot);
  },

  // ญาติหญิง / แม่: เพลงกล่อมฮีลญาติ (เขียว ตีขัดได้) · พัดไอโรค 3×3 ที่ York (แม่ 2 จุด) · รักษาระยะ 3–4
  kinswoman(g, e, york) {
    const s = e.s;
    const hurt = g.enemies.some(k => active(k) && k.s.family && (k !== e || s.lullaby.self)
      && cheb(k, e) <= s.lullaby.radius && k.hp < k.maxHp);
    if (hurt && ready(g, e, 'lullaby')) return windup(g, e, 'lullaby', null, around(g, e, s.lullaby.radius), 'heal');
    if (ready(g, e, 'fan') && cheb(e, york) <= s.fan.range) {
      const ahead = { x: york.x + york.face[0] * 2, y: york.y + york.face[1] * 2 };   // จุดที่สองดักทางที่ York หัน
      const cells = uniq([york, ahead].slice(0, s.fan.spots).flatMap(c => around(g, c, 1)));
      return windup(g, e, 'fan', toward(e, york), cells, 'disease');
    }
    const spot = (x, y) => { const n = cheb({ x, y }, york); return n >= s.keep[0] && n <= s.keep[1]; };
    if (!spot(e.x, e.y)) walk(g, e, spot);
  },
};
BEHAVIOR.brother = BEHAVIOR.kinsman;
BEHAVIOR.maggot = (g, e, york) => maggot(g, e, york, walk);
BEHAVIOR.mother = BEHAVIOR.kinswoman;
