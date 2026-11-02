// เครื่องมือ grid ล้วน: ระยะ ช่องว่าง เส้นตรง BFS และ DangerMap
import { BLOCK_MOVE, charAt } from './room.js';

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const has = (cells, p) => cells.some(([x, y]) => x === p.x && y === p.y);
export const occupies = e => e.hp > 0 || e.kneel;          // elite ที่คุกเข่ายังกินช่อง
export const active = e => e.hp > 0 && !e.kneel;
export const ready = (g, e, name) => g.t >= (e.ready[name] ?? 0);
export const partnerOf = (g, h) => g.heroes[h === g.heroes[0] ? 1 : 0];

// ขนาดตัว (บอส 2×2) · ช่องที่ตัวนี้ยืนทับ · ระยะเดินจาก a ถึงช่องที่ใกล้ที่สุดของ e
export const size = e => e.s?.size ?? 1;
export function cellsOf(e) {
  const n = size(e), out = [];
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) out.push({ x: e.x + dx, y: e.y + dy });
  return out;
}
export const distTo = (a, e) => Math.min(...cellsOf(e).map(c => manhattan(a, c)));
const covers = (e, x, y) => x >= e.x && x < e.x + size(e) && y >= e.y && y < e.y + size(e);

// Atez ที่ถูกบอสกลืนไม่กินช่อง
export const who = (g, x, y) =>
  g.heroes.find(h => h.x === x && h.y === y && !h.swallowed) || g.enemies.find(e => occupies(e) && covers(e, x, y));
export const walkable = (g, x, y) => !BLOCK_MOVE.includes(charAt(g.room, x, y));
export const free = (g, x, y) => walkable(g, x, y) && !who(g, x, y);

// ช่องจาก (x,y) ไปทาง dir สูงสุด len ช่อง หยุดก่อนช่องที่เป็นตัวอักษรใน block
export function line(g, x, y, [dx, dy], len, block) {
  const out = [];
  for (let i = 1; i <= len; i++) {
    if (block.includes(charAt(g.room, x + dx * i, y + dy * i))) break;
    out.push([x + dx * i, y + dy * i]);
  }
  return out;
}

// ช่องที่เดินได้รอบจุด c ในรัศมี r (รวมช่องกลาง)
export function around(g, c, r) {
  const out = [];
  for (let y = c.y - r; y <= c.y + r; y++)
    for (let x = c.x - r; x <= c.x + r; x++) if (walkable(g, x, y)) out.push([x, y]);
  return out;
}

export const aligned = (a, b) =>
  a.x === b.x ? [0, Math.sign(b.y - a.y)] : a.y === b.y ? [Math.sign(b.x - a.x), 0] : null;
export const toward = (a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
};

// BFS หาช่องที่ใกล้ที่สุดที่ goal(x, y) เป็นจริง (ไม่นับช่องเริ่ม) เลี่ยงช่องใน avoid
// คืน { x, y, first: [x, y] ก้าวแรก, dist }
export function bfs(g, sx, sy, goal, avoid) {
  const W = g.room.w, seen = new Uint8Array(W * g.room.h), q = [[sx, sy, null, 0]];
  seen[sx + sy * W] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, y, first, dist] = q[i];
    if (i > 0 && goal(x, y)) return { x, y, first, dist };
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ny * W;
      if (!free(g, nx, ny) || seen[k] || avoid?.has(k)) continue;
      seen[k] = 1;
      q.push([nx, ny, first || [nx, ny], dist + 1]);
    }
  }
  return null;
}

export function moveTo(g, ent, x, y, dur) {
  ent.px = ent.x; ent.py = ent.y; ent.x = x; ent.y = y; ent.t0 = g.t; ent.t1 = g.t + dur;
}

// ตำแหน่งที่วาด (เลื่อนนุ่มระหว่างช่อง) — ตำแหน่งจริงย้ายไปช่องใหม่ทันทีที่เริ่มก้าว
export function visual(ent, t) {
  const k = ent.t1 > ent.t0 ? Math.min(1, (t - ent.t0) / (ent.t1 - ent.t0)) : 1;
  return [ent.px + (ent.x - ent.px) * k, ent.py + (ent.y - ent.py) * k];
}

// DangerMap: ช่องเตือนที่มีผลกับฮีโร่ตัวนี้ (ดัชนี x + y * w)
// แดง/โรค เล็ง York · ม่วง (กอด) เล็ง Atez · Atez ก็เลี่ยงแดงด้วย (ยืนในแดง = บังด้วยความรัก)
export function dangerSet(g, h) {
  const W = g.room.w, s = new Set();
  for (const w of g.danger) {
    if (w.hazard === 'chandelier' || (w.hazard === 'stove' && h.kind !== 'york')) continue;   // โคมโดนแต่ศัตรู เตาไฟลวกแต่ York
    if (w.color === 'spawn' || w.skip?.[h.kind]) continue;   // ช่องไข่บอสไม่มีดาเมจ · บอท "ผู้เล่นใหม่" ตั้งใจพลาดบางท่า
    if (w.color !== 'heal' && (h.kind === 'atez' || w.color !== 'ctrl'))
      for (const [x, y] of w.cells) s.add(x + y * W);
  }
  if (h.kind === 'york') for (const z of g.zones) for (const [x, y] of z.cells) s.add(x + y * W);
  return s;
}
