// อาวุธเสริม การ์ดเลเวลอัป Relic และ Feat (GDD-MVP "อาวุธเสริม", "Relic", "Feat")
// อาวุธ passive และการเลือกการ์ดเป็นของฮีโร่ที่ผู้เล่นคุม · Feat ของ AI คู่หูสุ่มจากชุดของตัวเอง
import { WEAPONS, PASSIVES, GEAR, RELICS, ATTUNE, AMULET_CHANCE, FEATS, FEAT, LEVELS, LUCK } from './data.js';
import { BLOCK_SHOT } from './room.js';
import { DIRS, cheb, active, who, line, around, toward, partnerOf } from './grid.js';
import { strike, openModal } from './sim.js';

export const level = (h, id) => h.passives.find(p => p.id === id)?.lvl ?? 0;
export const hasRelic = (h, id) => h.relics.includes(id);
export const hasFeat = (h, id) => h.feats.includes(id);
export const heroOf = (g, kind) => g.heroes.find(h => h.kind === kind);

// ---------- อาวุธยิงเอง ----------
function cooldown(h, w) {
  let cd = WEAPONS[w.id].cd;
  if (w.id === 'holyCross') cd -= 0.2 * (w.lvl - 1);
  return cd * (1 - PASSIVES.thunderDrum.cd * level(h, 'thunderDrum'));
}

export function fireWeapons(g, h) {
  if (!g.enemies.some(active)) return;
  for (const w of h.weapons) {
    if (g.t < w.at) continue;
    w.at = g.t + cooldown(h, w);
    FIRE[w.id](g, h, w, WEAPONS[w.id]);
  }
}

function hitCells(g, h, cells, dice, opts) {
  g.fx.push({ kind: 'weapon', cells, t: g.t });
  const hit = new Set();   // บอส 2×2 โดนครั้งเดียวต่อการยิง
  for (const [x, y] of cells) {
    const e = who(g, x, y);
    if (e?.side === 'enemy' && active(e) && !hit.has(e)) { hit.add(e); strike(g, h, e, dice, toward(h, e), opts); }
  }
}

const shuffle = (g, xs) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(g.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const radiant = h => 1 + PASSIVES.blessCharm.radiant * level(h, 'blessCharm');
const poison = (h, base) => base + PASSIVES.rottenTome.poison * level(h, 'rottenTome');

const FIRE = {
  // กากบาท 4 ทิศ ระยะ 2 (Lv3 ระยะ 3)
  holyCross: (g, h, w, s) => hitCells(g, h,
    DIRS.flatMap(d => line(g, h.x, h.y, d, w.lvl >= 3 ? 3 : s.range, BLOCK_SHOT)), s.dice, { mul: radiant(h) }),
  // ดาว 8 ทิศ ระยะ 3 · ×1.5 กับ undead
  radiantStar: (g, h, w, s) => hitCells(g, h,
    [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(d => line(g, h.x, h.y, d, s.range, BLOCK_SHOT)),
    s.dice, { mul: s.undead * radiant(h) }),
  // ช่องสุ่มรอบตัว (ทุกเลเวล +1 ช่อง · Lv4 เป็น 5×5) + Poisoned
  plagueSwarm: (g, h, w, s) => {
    const n = Math.round((s.cells + w.lvl - 1) * (1 + PASSIVES.rottenTome.area * level(h, 'rottenTome')));
    const cells = shuffle(g, around(g, h, w.lvl >= 4 ? 2 : 1).filter(([x, y]) => x !== h.x || y !== h.y)).slice(0, n);
    hitCells(g, h, cells, s.dice, { poison: poison(h, s.poison) });
  },
  // แมลงวัน 6 ตัวไล่ตามศัตรูในระยะ
  lordsSwarm: (g, h, w, s) => {
    const foes = g.enemies.filter(e => active(e) && cheb(e, h) <= s.range);
    for (let i = 0; i < s.flies && foes.length; i++) {
      const e = foes[Math.floor(g.rand() * foes.length)];
      if (active(e)) hitCells(g, h, [[e.x, e.y]], s.dice, { poison: poison(h, s.poison) });
    }
  },
  // วงรอบตัว 1 ช่อง · ทุกเลเวลดาเมจ +1 · Lv5 ช็อต
  stormRing: (g, h, w, s) => hitCells(g, h,
    around(g, h, 1).filter(([x, y]) => x !== h.x || y !== h.y),
    [s.dice[0], s.dice[1], s.dice[2] + w.lvl - 1], { stun: w.lvl >= GEAR.maxLevel ? s.shock : 0 }),
  // ใบมีดเส้นตรงไปทางศัตรูที่ใกล้สุด · Lv2/Lv4 เพิ่ม 1 ใบ
  thrownBlade: (g, h, w, s) => {
    const blades = 1 + (w.lvl >= 2) + (w.lvl >= 4);
    const foes = g.enemies.filter(active).sort((a, b) => cheb(a, h) - cheb(b, h)).slice(0, blades);
    for (const e of foes) {
      const cells = line(g, h.x, h.y, toward(h, e), s.range, BLOCK_SHOT);
      const end = cells.findIndex(([x, y]) => who(g, x, y)?.side === 'enemy');
      hitCells(g, h, end < 0 ? cells : cells.slice(0, end + 1), s.dice, {});
    }
  },
};

// ---------- การ์ดเลเวลอัป ----------
export function gainXp(g, n) {
  g.xp += n;
  while (g.level < LEVELS.length && g.xp >= LEVELS[g.level]) {
    g.level++;
    openModal(g, { kind: 'levelup', options: drawCards(g) });
  }
}

export function drawCards(g) {
  const h = g.heroes[g.ctrl], cards = [], pool = [];
  for (const w of h.weapons) {   // evolution ออกแน่นอนเมื่ออาวุธและ passive คู่ถึง Lv5
    const s = WEAPONS[w.id];
    if (s.evo && w.lvl >= GEAR.maxLevel && level(h, s.passive) >= GEAR.maxLevel) cards.push({ type: 'evo', id: w.id, to: s.evo });
  }
  for (const [id, s] of Object.entries(WEAPONS)) {
    if (s.evolved) continue;
    const have = h.weapons.find(w => w.id === id || w.id === s.evo);
    if (!have && h.weapons.length < GEAR.weapons) pool.push({ type: 'weapon', id, lvl: 1 });
    else if (have?.id === id && have.lvl < GEAR.maxLevel) pool.push({ type: 'weapon', id, lvl: have.lvl + 1 });
  }
  for (const id of Object.keys(PASSIVES)) {
    const have = h.passives.find(p => p.id === id);
    if (!have && h.passives.length < GEAR.passives) pool.push({ type: 'passive', id, lvl: 1 });
    else if (have && have.lvl < GEAR.maxLevel) pool.push({ type: 'passive', id, lvl: have.lvl + 1 });
  }
  for (const [id, whoFor] of Object.entries(FEATS))
    if ((whoFor === 'any' || whoFor === h.kind) && !hasFeat(h, id)) pool.push({ type: 'feat', id });
  if (!g.heroes.some(x => hasRelic(x, 'amulet')) && g.rand() < AMULET_CHANCE) pool.push({ type: 'relic', id: 'amulet' });
  for (const c of shuffle(g, pool)) {   // Feat ออกไม่เกิน 1 ใบต่อการสุ่ม
    if (cards.length === 3) break;
    if (c.type === 'feat' && cards.some(x => x.type === 'feat')) continue;
    cards.push(c);
  }
  if (!cards.length) cards.push({ type: 'heal' });
  return cards;
}

export function setWeapon(h, id, lvl) {
  const w = h.weapons.find(w => w.id === id);
  if (w) w.lvl = Math.max(w.lvl, lvl); else h.weapons.push({ id, lvl, at: 0 });
}
export function setPassive(h, id, lvl) {
  const p = h.passives.find(p => p.id === id);
  if (p) p.lvl = Math.max(p.lvl, lvl); else h.passives.push({ id, lvl });
}

export function takeCard(g, c) {
  const h = g.heroes[g.ctrl];
  if (c.type === 'weapon') setWeapon(h, c.id, c.lvl);
  else if (c.type === 'passive') setPassive(h, c.id, c.lvl);
  else if (c.type === 'evo') h.weapons.find(w => w.id === c.id).id = c.to;
  else if (c.type === 'relic') attune(g, h, c.id);
  else if (c.type === 'heal') h.hp = Math.min(h.maxHp, h.hp + 10);
  else if (c.type === 'feat') {
    giveFeat(g, h, c.id);
    const p = partnerOf(g, h);   // AI คู่หูได้ Feat สุ่มจากชุดของตัวเองทุกครั้งที่ผู้เล่นเลือก Feat
    const opts = Object.entries(FEATS).filter(([id, w]) => (w === 'any' || w === p.kind) && !hasFeat(p, id));
    if (opts.length) giveFeat(g, p, opts[Math.floor(g.rand() * opts.length)][0]);
  }
}

export function giveFeat(g, h, id) {
  h.feats.push(id);
  if (id === 'tough') { const n = FEAT.tough * h.s.level; h.maxHp += n; h.hp += n; }
  else if (id === 'mobile') { h.s.dodge.cells += FEAT.mobile.cells; h.s.dodge.cd -= FEAT.mobile.cd; }
  else if (id === 'lucky') g.luck += LUCK;
  else if (id === 'spellSniper') h.s.attack.range += FEAT.spellSniper.range;
  // alert heavyArmor warCaster forgetPlan vowChain loveDenied: เช็กตอนใช้งาน
}

// ---------- Relic: attune 3 ช่อง ช่องเต็มต้องทิ้งชิ้นเดิม (ของต้องสาปทิ้งไม่ได้) ----------
export function attune(g, h, id) {
  if (RELICS[id].who !== 'any') h = heroOf(g, RELICS[id].who);
  if (hasRelic(h, id)) return;
  if (h.relics.length < ATTUNE) return addRelic(h, id);
  openModal(g, { kind: 'drop', hero: h.kind, relic: id, options: [
    ...h.relics.filter(r => !RELICS[r].cursed && RELICS[r].who !== 'pair').map(r => ({ drop: r })), { drop: null },
  ] });
}

// ผลที่เปลี่ยนค่าตัวละครตรงๆ (ใส่ = +1 ถอด = −1) · ผลอื่นเช็กตอนใช้งาน
function relicStats(h, id, sign) {
  const r = RELICS[id], hp = typeof r.hp === 'number' ? r.hp : r.hp?.[h.kind] ?? 0;
  if (hp) { h.maxHp += sign * hp; h.hp = Math.max(1, Math.min(h.maxHp, h.hp + sign * hp)); }
  if (r.lay && h.layPool != null) h.layPool = Math.max(0, h.layPool + sign * r.lay);
  if (r.dread && h.s.dread) { h.dreadLeft += sign * r.dread; h.s.dread.dur += sign * r.dur; }   // เปลือกที่ไร้ชื่อ
  if (r.stoneCd && h.s.stone) h.s.stone.cd -= sign * r.stoneCd;                                  // โล่ของคนเดียว
}
export function addRelic(h, id) { h.relics.push(id); relicStats(h, id, 1); }
export function dropRelic(h, id) { h.relics = h.relics.filter(r => r !== id); relicStats(h, id, -1); }

// ตัวคูณดาเมจจาก Relic ฉากจบ: อยู่ใกล้คู่หู (คำสาบานใหม่ / ความลับ) · เป้า Vow (แก้แค้น) · อยู่คนเดียว (เสียงที่พูดความจริง)
export function relicMul(g, by, target) {
  if (by.side !== 'hero') return 1;
  const near = cheb(by, partnerOf(g, by));
  let mul = 1;
  for (const id of by.relics) {
    const r = RELICS[id];
    if (r.near && near <= r.near) mul += r.dmg;
    if (r.vowDmg && by.vow?.target === target) mul += r.vowDmg;
    if (r.alone && r.dmg && near > r.alone) mul += r.dmg;
  }
  return mul;
}

// ใช้ใน hurt/strike/dodge/AI ฯลฯ
export const ac = h => h.s.ac + (hasRelic(h, 'ring') ? 1 : 0);
export const maxStacks = h => (hasRelic(h, 'shawl') ? RELICS.shawl.stacks : h.s.chains.max);
export const critChance = h => 0.05 + PASSIVES.whetstone.crit * level(h, 'whetstone');
