// บอส: ก้อนเนื้อโสมม (GDD-MVP "บอส") — 2×2 ช่อง HP 1,600 สองเฟส
// เฟส 1: อยู่กับที่ เล็ง York · ผนึกต้องใช้ York · ตุ่มหนองต้องใช้ Atez
// เฟส 2: คลานหา Atez ดูดภาชนะ · ลมหายใจ → หัวใจโผล่ด้านหลัง · โรคกินพื้นจากขอบสนาม
import { BOSS, FEAT } from './data.js';
import { BLOCK_SHOT, charAt, find } from './room.js';
import { DIRS, cheb, active, who, free, walkable, toward, moveTo, has, cellsOf, bfs, line } from './grid.js';
import { makeEnemy, roll, bark, hurt, cancel, gainTrust, baned } from './sim.js';
import { hasFeat } from './gear.js';

const center = b => ({ x: b.x + 0.5, y: b.y + 0.5 });
// ระยะ Chebyshev จากช่องถึงตัวบอส 2×2
const ringDist = (b, x, y) => Math.max(Math.max(b.x - x, 0, x - b.x - 1), Math.max(b.y - y, 0, y - b.y - 1));
const EIGHT = [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function spawnBoss(g) {
  const c = find(g.room, 'B')[0];
  if (!c) return;
  const b = makeEnemy(g, 'boss', c);
  Object.assign(b, {
    phase: g.rs.bossPhase ?? 1, face: [0, 0], next: {}, exposedTo: 0, slowTo: 0, finaleTo: 0, cutTo: 0,
    plates: find(g.room, 'S'), lit: 0, litAt: g.t + BOSS.seal.rotate, rot: 0, rotAt: Infinity, crawlAt: Infinity,
    regrowAt: Infinity, suction: null,
  });
  if (b.phase === 2) { b.hp = BOSS.hp * BOSS.phase2; startPhase2(g, b, 0); }
  else for (const [k, v] of Object.entries(BOSS.first)) b.next[k] = g.t + v;
  g.enemies.push(b);
  g.boss = b;
  if (b.phase === 1) growPustules(g, b);
}

function growPustules(g, b) {   // ตุ่มหนอง 3 จุด (บน ซ้าย ขวา)
  for (const [dx, dy] of [[0, -1], [-1, 1], [2, 0]])
    if (free(g, b.x + dx, b.y + dy)) {
      const p = makeEnemy(g, 'pustule', { x: b.x + dx, y: b.y + dy });
      Object.assign(p, { busyTo: Infinity, face: [0, 0] });
      g.enemies.push(p);
    }
  b.regrowAt = Infinity;
}

// ---------- ทุก tick ----------
export function updateBoss(g, b) {
  const [york, atez] = g.heroes, t = g.t;
  if (b.plates.length && t >= b.litAt) { b.lit = (b.lit + 1) % b.plates.length; b.litAt = t + BOSS.seal.rotate; }
  for (const e of g.enemies) if (e.kind === 'heart' && t >= e.until) e.hp = 0;
  if (b.suction) suction(g, b, atez, york);
  if (atez.swallowed) swallowed(g, b, atez);
  if (t < b.cutTo) return;
  if (b.phase === 1 && b.hp <= BOSS.hp * BOSS.phase2) return phaseTwo(g, b);
  if (!b.finaleTo && b.hp <= BOSS.hp * BOSS.finale.at) {   // HP 10%: เสียงครอบครัว Umbra ฝนแมลงวันสองเท่า 10 วิ แล้วฟุบ
    b.finaleTo = t + BOSS.finale.dur;
    bark(g, 'boss', 'boss.family');
  }
  if (b.finaleTo && t >= b.finaleTo) return collapse(g, b);
  if (t < b.exposedTo) return;   // Exposed: หยุดท่า
  if (t >= b.regrowAt) growPustules(g, b);
  const slow = t < b.slowTo ? BOSS.seal.mul : 1;
  for (const [name, m] of Object.entries(b.phase === 1 ? BOSS.p1 : BOSS.p2)) {
    if (typeof m !== 'object' || t < (b.next[name] ?? 0)) continue;
    const every = name === 'rain' && b.finaleTo ? m.every / BOSS.finale.rain : m.every;
    b.next[name] = t + every * slow;
    MOVES[name](g, b, m, slow);
  }
  if (b.phase === 2 && t >= b.crawlAt) { b.crawlAt = t + BOSS.p2.crawl * slow; crawl(g, b, atez); }
  if (b.phase === 2 && t >= b.rotAt) { b.rotAt = t + BOSS.rot.every; rot(g, b); }
}

function phaseTwo(g, b) {   // ฉากสั้น 3 วิ แผ่นผนึกแตก 2 แผ่น เหลือ 2 แผ่นฝั่งประตู
  b.phase = 2;
  g.danger = g.danger.filter(w => !w.boss);
  for (const e of g.enemies) if (e.kind === 'pustule') e.hp = 0;
  startPhase2(g, b, BOSS.cutscene);
  bark(g, 'dm', 'dm.sealCracks');
  g.rs.bossPhase = 2;
  g.onCheckpoint?.(g);   // เฟส 2 เป็น checkpoint
}

function startPhase2(g, b, delay) {
  b.cutTo = g.t + delay;
  b.regrowAt = Infinity;   // เฟส 2 ตุ่มหนองไม่งอกอีก
  b.plates = b.plates.filter(p => p.y > b.y);
  b.lit %= b.plates.length;
  for (const k of Object.keys(BOSS.p2)) b.next[k] = g.t + delay + (BOSS.first[k] ?? 2);
  b.crawlAt = g.t + delay + BOSS.p2.crawl;
  b.rotAt = g.t + delay + BOSS.rot.every;
}

function collapse(g, b) {   // บอสฟุบ: ศัตรูที่เหลือสลายไปด้วย
  for (const e of g.enemies) if (e.hp > 0 || e.kneel) { cancel(g, e); e.hp = 0; e.kneel = false; g.fx.push({ kind: 'dust', x: e.x, y: e.y, t: g.t }); }
  g.danger = [];
  g.zones = [];
  g.heroes[1].swallowed = null;
}

// ---------- ท่าโจมตี ----------
function tele(g, b, name, cells, warn, extra = {}) {
  const alert = g.heroes.some(h => hasFeat(h, 'alert')) ? FEAT.alert.warn : 0;
  g.danger.push({ name, cells, color: 'dmg', start: g.t, at: g.t + warn + alert, owner: b, boss: true, ...extra });
}

const ring = (g, b, r) => {
  const out = [];
  for (let y = 0; y < g.room.h; y++) for (let x = 0; x < g.room.w; x++)
    if (ringDist(b, x, y) === r && walkable(g, x, y)) out.push([x, y]);
  return out;
};
// ช่องว่าง 1 ช่องของวง: ช่องในวงที่อยู่ทางทิศ dir จากกลางบอสมากที่สุด
function gap(b, cells, [dx, dy]) {
  const c = center(b), score = ([x, y]) => ((x - c.x) * dx + (y - c.y) * dy) / Math.hypot(x - c.x, y - c.y);
  const best = cells.reduce((a, p) => (score(p) > score(a) ? p : a), cells[0]);
  return cells.filter(p => p !== best);
}

const MOVES = {
  // วงแหวนรอบบอสทีละวง (เฟส 2: 2 วงพร้อมกัน ช่องว่างคนละฝั่ง)
  ripple(g, b, m, slow) {
    const start = Math.floor(g.rand() * 8);
    m.rings.forEach((r, i) => {
      const dir = m.step ? EIGHT[(start + i * 3) % 8] : EIGHT[(start + i * 4) % 8].map(v => (i ? -v : v));
      tele(g, b, 'ripple', gap(b, ring(g, b, r), dir), (m.warn + i * m.step) * slow, { dice: m.dice });
    });
  },
  // 6 ช่องสุ่ม + ช่องใต้ฮีโร่แต่ละตัว
  rain(g, b, m, slow) {
    const open = [];
    for (let y = 1; y < g.room.h - 1; y++) for (let x = 1; x < g.room.w - 1; x++) if (free(g, x, y)) open.push([x, y]);
    const cells = g.heroes.filter(h => !h.down && !h.swallowed).map(h => [h.x, h.y]);
    for (let i = 0; i < m.cells && open.length; i++) cells.push(open.splice(Math.floor(g.rand() * open.length), 1)[0]);
    tele(g, b, 'rain', cells, m.warn * slow, { dice: m.dice });
  },
  // แส้หนวด: เส้น 6 ช่องจากบอสไปหา York + Prone
  whip(g, b, m, slow) {
    const york = g.heroes[0], dir = toward(center(b), york);
    const sx = dir[0] ? (dir[0] > 0 ? b.x + 1 : b.x) : Math.min(b.x + 1, Math.max(b.x, york.x));
    const sy = dir[1] ? (dir[1] > 0 ? b.y + 1 : b.y) : Math.min(b.y + 1, Math.max(b.y, york.y));
    tele(g, b, 'whip', line(g, sx, sy, dir, m.len, BLOCK_SHOT), m.warn * slow, { dice: m.dice, prone: m.prone });
  },
  // วางไข่: ลูกน้ำ 2 ตัวโผล่ข้างบอส
  eggs(g, b, m, slow) {
    const spots = cellsOf(b).flatMap(c => DIRS.map(([dx, dy]) => [c.x + dx, c.y + dy])).filter(([x, y]) => free(g, x, y));
    const cells = [];
    for (let i = 0; i < m.count && spots.length; i++) cells.push(spots.splice(Math.floor(g.rand() * spots.length), 1)[0]);
    tele(g, b, 'eggs', cells, m.warn * slow, { color: 'spawn' });
  },
  // แรงดูด: เส้นม่วงจากบอสถึง Atez แล้วดึง 1 ช่องทุก 0.5 วิ นาน 3 วิ
  suction(g, b, m, slow) {
    const atez = g.heroes[1];
    if (atez.down || atez.swallowed) return;
    tele(g, b, 'suction', pathTo(b, atez), m.warn * slow, { color: 'ctrl' });
  },
  // ลมหายใจราชา: กรวยกว้าง 3 → 5 ยาว 6 ช่องไปหา York · เสาบังได้ · หลังท่า หัวใจโผล่ด้านหลัง
  breath(g, b, m, slow) {
    const york = g.heroes[0], dir = toward(center(b), york);
    const lat = dir[0] ? Math.min(b.y + 1, Math.max(b.y, york.y)) : Math.min(b.x + 1, Math.max(b.x, york.x));
    const sx = dir[0] > 0 ? b.x + 1 : b.x, sy = dir[1] > 0 ? b.y + 1 : b.y;
    const cells = [];
    for (let o = -2; o <= 2; o++) {   // แต่ละแนว: หยุดที่เสาหรือกำแพง
      const ox = dir[0] ? sx : lat + o, oy = dir[0] ? lat + o : sy;
      for (let i = 1; i <= m.len; i++) {
        if (Math.abs(o) === 2 && i <= 2) continue;   // 2 แถวแรกกว้าง 3 ช่อง
        const x = ox + dir[0] * i, y = oy + dir[1] * i;
        if (BLOCK_SHOT.includes(charAt(g.room, x, y))) break;
        cells.push([x, y]);
      }
    }
    tele(g, b, 'breath', cells, m.warn * slow, { dice: m.dice, poison: m.poison, dir });
  },
};

// เส้นช่องจากขอบบอสถึง Atez (Bresenham ไม่รวมสองปลาย)
export function pathTo(b, h) {
  const c = cellsOf(b).reduce((a, p) => (cheb(p, h) < cheb(a, h) ? p : a));
  const out = [], dx = Math.abs(h.x - c.x), dy = -Math.abs(h.y - c.y), sx = Math.sign(h.x - c.x), sy = Math.sign(h.y - c.y);
  let [x, y, err] = [c.x, c.y, dx + dy];
  while (x !== h.x || y !== h.y) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x !== h.x || y !== h.y) out.push([x, y]);
  }
  return out;
}

// ---------- ผลของท่า (เรียกจาก resolve ใน sim) ----------
export function resolveBoss(g, w) {
  const b = g.boss, [york] = g.heroes;
  if (w.name === 'eggs') {
    for (const [x, y] of w.cells) if (free(g, x, y)) g.enemies.push(makeEnemy(g, 'maggot', { x, y }));
    return;
  }
  if (w.name === 'suction') { b.suction = { until: g.t + BOSS.p2.suction.dur, next: g.t }; return; }
  g.fx.push({ kind: 'strike', cells: w.cells, color: 'dmg', t: g.t });
  if (has(w.cells, york) && !york.down) { g.stats.warned++; if (g.t >= york.iframeTo) g.stats.hit++; }
  for (const h of g.heroes) {   // ท่าบอสโดนทั้งสองฮีโร่ (บอสไม่ใช่ครอบครัว ไม่มีบังด้วยความรัก)
    if (!has(w.cells, h) || g.t < h.iframeTo || h.down || h.swallowed) continue;
    hurt(g, h, baned(g, w.owner, roll(g, w.dice)));
    if (w.prone) h.lockTo = Math.max(h.lockTo, g.t + w.prone);
    if (w.poison) h.poisonTo = Math.max(h.poisonTo, g.t + w.poison);
  }
  if (w.name === 'boom') { w.owner.hp = 0; g.fx.push({ kind: 'dust', x: w.owner.x, y: w.owner.y, t: g.t }); }
  if (w.name === 'breath' && active(b)) heart(g, b, w.dir);
}

function heart(g, b, dir) {   // หัวใจโผล่ด้านหลังบอส 3 วิ
  const back = [-dir[0], -dir[1]];
  const x = back[0] ? (back[0] > 0 ? b.x + 2 : b.x - 1) : b.x, y = back[1] ? (back[1] > 0 ? b.y + 2 : b.y - 1) : b.y;
  if (!free(g, x, y)) return;
  const h = makeEnemy(g, 'heart', { x, y });
  Object.assign(h, { busyTo: Infinity, face: [0, 0], until: g.t + BOSS.heartDur });
  g.enemies.push(h);
}

// ลูกน้ำ: เดินหา York ติดตัวแล้วระเบิด 3×3
export function maggot(g, e, york, walk) {
  if (cheb(e, york) <= 1) {
    e.windup = { name: 'boom', cells: around3(g, e), color: 'dmg', start: g.t, at: g.t + e.s.boom.warn, owner: e, boss: true, dice: e.s.boom.dice };
    g.danger.push(e.windup);
    return;
  }
  walk(g, e, (x, y) => cheb({ x, y }, york) === 1);
}
const around3 = (g, e) => EIGHT.concat([[0, 0]]).map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(([x, y]) => walkable(g, x, y));

// ---------- แรงดูด · ถูกกลืน · โรค ----------
function suction(g, b, atez, york) {
  const s = b.suction;
  if (g.t >= s.until || atez.down || atez.swallowed || !active(b)) { b.suction = null; return; }
  if (g.t < s.next) return;
  s.next += BOSS.p2.suction.pull;
  if (has(pathTo(b, atez), york) || g.t < atez.heldTo) return;   // York ยืนขวางเส้น หรือจับ Atez ไว้
  const [dx, dy] = toward(atez, center(b));
  if (free(g, atez.x + dx, atez.y + dy)) moveTo(g, atez, atez.x + dx, atez.y + dy, 0.2);
  if (cellsOf(b).some(c => cheb(c, atez) <= 1)) swallow(g, b, atez);
}

function swallow(g, b, atez) {   // ถูกดูดถึงตัว: รับ 3d6 ต่อวิ บอสฟื้น 1% ต่อวิ จน York ตีบอสรวม 30 (หรือ Smite 2 ครั้ง)
  atez.swallowed = { dealt: 0, smites: 0, next: g.t + BOSS.swallow.tick };
  atez.hold = null;
  b.suction = null;
}

function swallowed(g, b, atez) {
  const sw = atez.swallowed;
  if (sw.dealt >= BOSS.swallow.free || sw.smites >= BOSS.swallow.smites) {
    atez.swallowed = null;
    const at = bfs(g, b.x, b.y, (x, y) => free(g, x, y));
    if (at) Object.assign(atez, { x: at.x, y: at.y, px: at.x, py: at.y, t0: g.t, t1: g.t });
    return;
  }
  if (g.t < sw.next) return;
  sw.next += BOSS.swallow.tick;
  if (!atez.down) hurt(g, atez, roll(g, BOSS.swallow.dice));
  b.hp = Math.min(BOSS.hp, b.hp + BOSS.hp * BOSS.swallow.heal);
}

// York ตีบอสขณะ Atez ถูกกลืน: นับดาเมจดิบเพื่อดึงออก
export function bossHit(g, target, dmg, by, smite) {
  const b = g.boss, floor = BOSS.hp * BOSS.finale.at;
  const cap = n => (b.finaleTo ? 0 : Math.max(0, Math.min(n, b.hp - floor)));   // ช่วงท้ายอมตะจนฟุบเอง
  if (target.kind === 'pustule') { b.hp -= cap(dmg); return dmg; }   // ดาเมจที่ตุ่มนับเข้า HP บอสด้วย
  if (target.kind === 'heart') { b.hp -= cap(dmg * BOSS.heartMul); return 0; }
  if (target.kind !== 'boss') return dmg;
  const atez = g.heroes[1];
  if (atez.swallowed && by.kind === 'york') { atez.swallowed.dealt += dmg; if (smite) atez.swallowed.smites++; }
  return cap(dmg * (g.t < b.exposedTo ? BOSS.exposed.mul : BOSS.body));
}

// ตุ่มแตกครบ 3 จุด → Exposed 4 วิ · งอกใหม่หลัง 12 วิ (เฉพาะเฟส 1)
export function onFall(g, e) {
  const b = g.boss;
  if (e.kind !== 'pustule' || !b || g.enemies.some(p => p.kind === 'pustule' && p.hp > 0)) return;
  b.exposedTo = g.t + BOSS.exposed.dur;
  if (b.phase === 1) b.regrowAt = g.t + BOSS.pustules.regrow;
}

// ภาชนะแห่งโรคระบาด (GDD หมวด 5): Atez ล้ม → โรคขยายจากตัวจนกว่าจะชุบ (York ในโซนโดน 1d4 ทุก 0.5 วิ)
// ไฟต์บอส 1 ช่องต่อวิ · ห้องอื่นช้ากว่า 2 เท่า (GDD-MVP "เร็วกว่านอกไฟต์บอส 2 เท่า")
export function plague(g, atez) {
  const z = g.zones.find(z => z.plague);
  if (!atez.down) { if (z) g.zones = g.zones.filter(x => x !== z); return; }
  const spread = g.boss && active(g.boss) ? BOSS.plague.spread : BOSS.plague.outside;
  const r = 1 + Math.floor((g.t - atez.down.since) * spread), cells = [];
  for (let y = atez.y - r; y <= atez.y + r; y++) for (let x = atez.x - r; x <= atez.x + r; x++) if (walkable(g, x, y)) cells.push([x, y]);
  if (z) z.cells = cells;
  else g.zones.push({ plague: true, cells, until: Infinity, next: g.t, m: BOSS.rot });
}

function rot(g, b) {   // โรคกินพื้นจากขอบสนามเข้ามาทีละวง
  b.rot++;
  const cells = [];
  for (let y = 0; y < g.room.h; y++) for (let x = 0; x < g.room.w; x++)
    if (Math.min(x, y, g.room.w - 1 - x, g.room.h - 1 - y) === b.rot && walkable(g, x, y)) cells.push([x, y]);
  g.zones.push({ cells, until: Infinity, next: g.t, m: BOSS.rot });
}

function crawl(g, b, atez) {   // คลานเข้าหา Atez 1 ช่อง (ลองแกนหลักก่อน แล้วแกนรอง)
  const c = center(b), dx = Math.sign(atez.x - c.x), dy = Math.sign(atez.y - c.y);
  const tries = Math.abs(atez.x - c.x) >= Math.abs(atez.y - c.y) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  for (const [mx, my] of tries) {
    if (!mx && !my) continue;
    const ok = cellsOf(b).every(({ x, y }) => {
      const nx = x + mx, ny = y + my, o = who(g, nx, ny);
      return walkable(g, nx, ny) && (!o || o === b);
    });
    if (ok) return moveTo(g, b, b.x + mx, b.y + my, 0.5);
  }
}

// ผนึก: York ยืนบนแผ่นที่สว่าง (ใช้ใน world.interactable)
export const litPlate = g => g.boss && active(g.boss) && g.boss.plates[g.boss.lit];
export function sealBoss(g, york) {
  const b = g.boss;
  if (!b || york.chan < 1) return;
  if (york.chan === york.s.channel.max) york.chanAt = g.t + york.s.channel.regen;
  york.chan--;
  b.slowTo = g.t + BOSS.seal.slow;
  for (const w of g.danger) if (w.boss && w.at > g.t) w.at = g.t + (w.at - g.t) * BOSS.seal.mul;   // ช่องเตือนนานขึ้น ×1.5
  g.fx.push({ kind: 'heal', x: york.x, y: york.y, t: g.t });
}

// York จับ Atez ไว้ตอนบอสดูด
export function holdAtez(g, york, atez) {
  const b = g.boss;
  const pending = g.danger.find(w => w.name === 'suction');
  if (!b?.suction && !pending) return false;
  atez.heldTo = (b.suction?.until ?? pending.at + BOSS.p2.suction.dur);
  gainTrust(g, 'grabAtez');
  bark(g, 'york', 'york.hold');
  return true;
}
