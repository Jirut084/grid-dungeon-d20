// ตรรกะเกมล้วน ไม่แตะ DOM — เบราว์เซอร์ บอททดสอบ และ Node รันไฟล์นี้ตัวเดียวกัน
// กฎทั้งหมดอิง GDD หมวด 3, 8, 10 และ GDD-MVP (ศัตรูในคฤหาสน์, ตัวเลขสมดุล, Trust, Relic, Feat)
import {
  HEROES, ENEMIES, DOWN, TRUST, SWARM, AI, ENEMY_WIS, RECOVER, START, FEAT, BELL, RELICS, PASSIVES, BOSS,
} from './data.js';
import { BLOCK_MOVE, BLOCK_SHOT, charAt, find } from './room.js';
import { cheb, has, active, partnerOf, who, free, line, bfs, moveTo, toward } from './grid.js';
import { updateEnemy } from './enemies.js';
import { think } from './ai.js';
import { enterRoom, tryDoor, interact, updateHazards, resolveHazard, roomCleared, choose, giveRelic } from './world.js';
import { fireWeapons, gainXp, hasFeat, hasRelic, ac, maxStacks, critChance, level, relicMul, addRelic, heroOf } from './gear.js';
import { resolveBoss, bossHit, onFall, holdAtez, plague } from './boss.js';

export { visual } from './grid.js';

// สุ่มแบบมี seed (mulberry32) ให้บอทและเทสต์เล่นซ้ำได้ผลเดิม
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// rooms: ห้องเดียว (parseRoom) หรือ { R0: room, R1: room, ... } ทั้งคฤหาสน์
// opts: seed · roomId (ห้องเดียว: ใช้หาคลื่นศัตรู) · ai: false = ตัวที่ไม่ได้คุมยืนนิ่ง · select: เปิดหน้าเลือกฮีโร่
// legacy: Relic จากฉากจบของ run ก่อน (ติดตัวไปทุก run หลังจากนี้)
export function createGame(rooms, { seed = 1, roomId, ai = true, select = false, legacy = [] } = {}) {
  const single = !!rooms.rows;
  const g = {
    rooms: single ? { [roomId ?? 'test']: rooms } : rooms, roomStates: {}, t: 0, dt: 0, rand: rng(seed),
    heroes: [makeHero('york'), makeHero('atez')], ctrl: 0, ai, autopilot: false, cmd: 'follow',
    trust: TRUST.start, trustSum: {}, trustLog: [], barks: [], log: [],
    xp: 0, level: 0, luck: 0, kills: 0, prayed: 0, spoken: 0, journal: { corpses: [], notes: [] },
    bossT: 0, bossDeaths: 0, ending: null, bag: [],
    modal: select ? { kind: 'hero', options: [{ hero: 'york' }, { hero: 'atez' }] } : null, queue: [],
  };
  for (const id of legacy)
    for (const h of RELICS[id].who === 'pair' ? g.heroes : [heroOf(g, RELICS[id].who)]) addRelic(h, id);
  enterRoom(g, single ? roomId ?? 'test' : START);
  return g;
}

function makeHero(kind) {
  const s = structuredClone(HEROES[kind]);   // ของฮีโร่ตัวนี้ Feat แก้ค่าได้
  return {
    kind, side: 'hero', s, hp: s.hp, maxHp: s.hp, temp: 0, face: [0, -1], hitAt: -9,
    atkAt: 0, dodgeAt: 0, iframeTo: 0, lockTo: 0, hold: null, down: null, thinkAt: 0, prevDodge: false, prevHold: false,
    feats: [], relics: [], weapons: [], passives: [], poisonTo: 0, swallowed: null, heldTo: 0,
    // York
    chan: s.channel?.max, chanAt: 0, vow: null, smiteLeft: s.smite?.uses, smiteArmed: false, grabAt: 0, dashAt: 0,
    stoneAt: 0, stoneTo: 0,
    layPool: s.lay?.pool, quirk: null, quirkAt: AI.quirk.cd,
    // Atez
    dreadLeft: s.dread?.uses, dreadTo: 0, pactLeft: s.pact?.slots, rodUsed: false, stacks: 0, stackAt: 0, chainFloor: 0, restrainTo: 0, hugger: null, mash: 0,
  };
}

export function makeEnemy(g, kind, c) {
  const s = ENEMIES[kind];
  return {
    kind, side: 'enemy', s, hp: s.hp, maxHp: s.hp,
    x: c.x, y: c.y, px: c.x, py: c.y, t0: g.t, t1: g.t, face: [0, 1], hitAt: -9,
    busyTo: g.t + 0.3 + g.rand() * 0.5, ready: {}, windup: null, flee: 0, chain: 0,   // หน่วงเริ่มต่างกันนิดหน่อย
    near: 0, holding: false, parryTo: 0, stunTo: 0, fearTo: 0, poisonTo: 0, charmTo: 0,
    kneel: false, kneelAt: 0, summoned: 0, atezHitAt: -99, baneTo: 0,
  };
}

// วางศัตรูที่ช่อง c ถ้าไม่ว่างใช้ช่องว่างที่ใกล้ที่สุด
export function spawn(g, kind, c) {
  const at = free(g, c.x, c.y) ? c : bfs(g, c.x, c.y, () => true);
  if (at) g.enemies.push(makeEnemy(g, kind, at));
}

// คลื่นศัตรู: คลื่นแรก = ตัวอักษรในไฟล์ + waves[0] ที่ช่อง ? · elite เกิดที่ช่อง E พร้อมคลื่นสุดท้าย
export function spawnWave(g) {
  const plan = g.plan;
  if (!plan) return;
  const doors = find(g.room, 'D').map(d => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: d.x + dx, y: d.y + dy })).find(c => free(g, c.x, c.y))).filter(Boolean);
  const spots = find(g.room, '?').length ? find(g.room, '?') : doors;   // ไม่มีช่อง ? = เข้ามาทางประตู
  plan.waves[g.wave].forEach((kind, i) => spawn(g, kind, spots[i % spots.length]));
  if (g.wave === plan.waves.length - 1 && plan.elite) spawn(g, plan.elite, find(g.room, 'E')[0]);
}

// ---------- modal ----------
export function openModal(g, m) { if (g.modal) g.queue.push(m); else g.modal = m; }
export function closeModal(g) { g.modal = g.queue.shift() ?? null; }

// ---------- dice, damage, trust ----------
export const d = (g, n) => 1 + Math.floor(g.rand() * n);
export function roll(g, [n, sides, bonus]) {
  let s = bonus;
  for (let i = 0; i < n; i++) s += d(g, sides);
  return s;
}
const rollDis = (g, dice, dis) => (dis ? Math.min(roll(g, dice), roll(g, dice)) : roll(g, dice));

export function gainTrust(g, k) {
  const [v, cap] = TRUST[k], sum = g.trustSum[k] ?? 0;
  const add = v > 0 ? Math.min(v, cap - sum) : Math.max(v, cap - sum);
  if (!add) return;
  g.trustSum[k] = sum + add;
  g.trust = Math.max(0, Math.min(100, g.trust + add));
  g.trustLog.push({ t: g.t, key: k, add });
}

export const bark = (g, who, key) => g.barks.push({ t: g.t, who, key });
// Bane: ดาเมจของศัตรูที่ติด Bane −1d4
export const baned = (g, e, dmg) => (g.t < (e?.baneTo ?? 0) ? Math.max(0, dmg - roll(g, HEROES.atez.pact.bane.dice)) : dmg);

// GDD: โจมตีที่เล็งถูกโดนเสมอ ทอย d20 แบบมองไม่เห็น 20 = คริต ลูกเต๋าดาเมจ ×2
// Advantage (ทอยดาเมจ 2 ชุดเอาค่าสูง + d20 คริต 2 ลูก): ตีจากด้านหลัง · เป้า Vow · เป้าที่ Stunned
// Disadvantage: ผู้ตีติด Poisoned · opts: smite, mul (ตัวคูณดาเมจ), poison/stun (วิ)
export function strike(g, by, target, dice, dir, { smite = false, mul = 1, poison = 0, stun = 0 } = {}) {
  if (!active(target)) return false;
  const front = dir[0] === -target.face[0] && dir[1] === -target.face[1];
  if (front && g.t < target.parryTo) {   // ปัดป้อง: กันทุกการตีจากด้านหน้า
    g.fx.push({ kind: 'block', x: target.x, y: target.y, t: g.t });
    return false;
  }
  const adv = (dir[0] === target.face[0] && dir[1] === target.face[1]) || g.t < target.stunTo
    || (by.vow?.target === target && g.t < by.vow.until)
    || g.t < (target.exposedTo ?? 0) || target.kind === 'heart';   // บอส Exposed · หัวใจอยู่ด้านหลังเสมอ
  const dis = g.t < (by.poisonTo ?? 0);
  const mode = adv === dis ? 0 : adv ? 1 : -1;        // Advantage กับ Disadvantage หักล้างกัน
  const critRoll = () => g.rand() < critChance(by);   // d20 = 20 (5%) + Whetstone
  // คอมโบ GDD หมวด 8: ศัตรูที่ Frightened โดน Divine Smite = คริติคอลแน่นอน
  const crit = (smite && g.t < target.fearTo) || (mode < 0 ? critRoll() && critRoll() : critRoll() || (mode > 0 && critRoll()));
  const dd = crit ? [dice[0] * 2, dice[1], dice[2]] : dice;
  let dmg = mode > 0 ? Math.max(roll(g, dd), roll(g, dd)) : rollDis(g, dd, mode < 0);
  if (hasRelic(by, 'censer')) dmg *= RELICS.censer.dmg;
  if (by.ai80) dmg *= AI.damage;
  dmg = bossHit(g, target, dmg * mul * relicMul(g, by, target), by, smite);   // ตัวบอส ×0.5 · ตุ่ม/หัวใจส่งดาเมจเข้าบอส
  target.hp -= Math.round(dmg);
  target.hitAt = g.t;
  if (poison) target.poisonTo = Math.max(target.poisonTo, g.t + poison);
  if (stun) target.stunTo = Math.max(target.stunTo, g.t + stun);
  if (crit) g.fx.push({ kind: 'crit', x: target.x, y: target.y, t: g.t });
  if (!by.ai80 && by.side === 'hero') g.lastTarget = target;
  if (by.kind === 'atez') target.atezHitAt = g.t;
  if (by.kind === 'york' && target.holding) release(g, target, true);
  if (target.windup?.name === 'lullaby') cancel(g, target);           // เพลงกล่อม: ตีโดน 1 ครั้ง = ยกเลิก
  if (front && target.s.parry && g.t >= (target.ready.parry ?? 0)) {  // โดนตีด้านหน้า → ยกไม้เท้า
    target.parryTo = g.t + target.s.parry.dur;
    target.ready.parry = g.t + target.s.parry.cd;
  }
  summon(g, target);
  if (target.hp <= 0) fall(g, target);
  return true;
}

// ทุก 25% HP เรียกฟุตแมน (พี่ชาย)
function summon(g, e) {
  const s = e.s.summon;
  if (!s) return;
  while (e.summoned < 3 && e.hp <= e.maxHp * (1 - s.every * (e.summoned + 1))) {
    e.summoned++;
    const spots = find(g.room, '?');
    for (let i = 0; i < s.count; i++) spawn(g, s.kind, spots[(e.summoned + i) % spots.length] ?? e);
  }
}

// HP หมด: ศัตรูธรรมดาสลายเป็นผงกำยาน (XP) · elite คุกเข่ารอให้ผู้เล่นเลือกว่าใครปิด
function fall(g, e) {
  cancel(g, e);
  if (e.holding) release(g, e, false);
  e.hp = 0;
  const york = g.heroes[0], atez = g.heroes[1];
  if (york.vow?.target === e && hasFeat(york, 'vowChain')) {   // Feat สาบานต่อ: Vow กระโดดไปตัวที่ใกล้ที่สุด
    const next = g.enemies.filter(active).sort((a, b) => cheb(a, e) - cheb(b, e))[0];
    york.vow.target = next ?? null;
  }
  if (hasRelic(atez, 'censer') && ++g.kills % RELICS.censer.kills === 0) atez.chainFloor++;   // กระถางต้องสาป
  onFall(g, e);
  gainXp(g, e.s.xp);
  if (e.s.elite) { e.kneel = true; e.kneelAt = g.t; return; }
  g.fx.push({ kind: 'dust', x: e.x, y: e.y, t: g.t });
}

function finish(g, e, by) {
  e.kneel = false;
  g.fx.push({ kind: 'dust', x: e.x, y: e.y, t: g.t });
  if (by.kind !== 'atez') return;
  gainTrust(g, 'finish');
  bark(g, 'atez', 'atez.finish');
  if (e.kind === 'mother') giveRelic(g, by, 'shawl');   // ผ้าคลุมไหล่ของแม่: Atez ปิดแม่ด้วยมือตัวเองเท่านั้น
}

export function cancel(g, e) {
  if (e.windup) g.danger = g.danger.filter(w => w !== e.windup);
  e.windup = null;
  e.chain = 0;
}

// GDD: ดาเมจที่รับ = ดาเมจ × (1 − (AC − 10) × 0.03) · HP ชั่วคราวรับก่อน
// Heavy Armor Master: ตีธรรมดา −3 · War Caster: กดค้างไม่หลุดเมื่อโดนตี
// Stone's Endurance: กดก่อนโดน 0.5 วิ ลด 1d12+5 · โล่ของคนเดียว: ไม่มีคู่หูในระยะ 3 ช่อง ดาเมจที่รับ −10%
export function hurt(g, h, dmg, kind = 'hit') {
  if (h.down) return;
  let n = Math.max(1, Math.round(dmg * (1 - (ac(h) - 10) * 0.03)));
  if (kind === 'hit' && hasFeat(h, 'heavyArmor')) n = Math.max(1, n - FEAT.heavyArmor);
  if (kind === 'hit' && g.t < h.stoneTo) { n = Math.max(0, n - roll(g, h.s.stone.dice)); h.stoneTo = 0; }
  if (hasRelic(h, 'loneShield') && cheb(h, g.heroes[h.kind === 'york' ? 1 : 0]) > RELICS.loneShield.alone) n = Math.round(n * (1 - RELICS.loneShield.taken));
  if (!n) return;
  const soak = Math.min(h.temp, n);
  h.temp -= soak;
  n = Math.min(h.hp, n - soak);
  h.hp -= n;
  h.hitAt = g.t;
  if (!hasFeat(h, 'warCaster')) h.hold = null;
  if (h.kind === 'york') g.stats.lost += n;
  if (h.hp === 0) h.down = { since: g.t, next: g.t + DOWN.save, ok: 0, fail: 0, late: false };
}

// death save ทุก 2 วิ: ≥10 สำเร็จ (Bless Charm +1/เลเวล) · 20 ลุก HP 1 · 1 = ล้มเหลว 2 ครั้ง · สำเร็จ 3 ลุก HP 1
function deathSaves(g, h) {
  const dn = h.down;
  if (!dn.late && g.t - dn.since > DOWN.late) { dn.late = true; gainTrust(g, 'late'); }
  if (g.t < dn.next) return;
  dn.next += DOWN.save;
  const r = d(g, 20), ok = saveOk(h, r);
  g.fx.push({ kind: 'save', x: h.x, y: h.y, r, ok, t: g.t });   // GDD: death save เป็นการทอยที่เห็นบนจอ
  // Lucky: ผู้เล่นทอยใหม่ได้เมื่อทอยพลาด (หยุดเกมถามก่อน)
  if (!ok && g.luck > 0 && h === g.heroes[g.ctrl]) return openModal(g, { kind: 'deathsave', hero: h.kind, r, options: [{ reroll: true }, { ok: true }] });
  applySave(h, r);
}
const saveOk = (h, r) => r === 20 || (r !== 1 && r + PASSIVES.blessCharm.check * level(h, 'blessCharm') >= 10);
export function applySave(h, r) {
  const dn = h.down;
  if (!dn) return;
  if (r === 20) return stand(h, 1);
  if (saveOk(h, r)) dn.ok++; else dn.fail += r === 1 ? 2 : 1;
  if (dn.ok >= 3) stand(h, 1);
}
const stand = (h, hp) => { h.down = null; h.hp = hp; };

// ---------- conditions ----------
function shield(g, atez) {
  atez.stacks = Math.min(maxStacks(atez), atez.stacks + 1);
  atez.stackAt = g.t;
  gainTrust(g, 'shield');
  if (hasFeat(atez, 'loveDenied')) g.heroes[0].temp += FEAT.loveDenied.temp;   // ความรักที่ปฏิเสธ
  g.fx.push({ kind: 'shield', x: atez.x, y: atez.y, t: g.t });
}

function restrain(g, atez, e) {
  const h = e.s.hug;
  const dur = atez.stacks >= atez.s.chains.max ? h.holdFull : h.hold;
  atez.restrainTo = g.t + dur;
  atez.hugger = e;
  atez.mash = 0;
  atez.hold = null;
  e.holding = true;
  e.busyTo = g.t + dur;
  if (e.kind === 'mother') bark(g, 'mother', 'mother.hug');
}

export function release(g, e, byYork) {
  const atez = g.heroes[1];
  if (atez.hugger !== e) return;
  atez.restrainTo = g.t;
  atez.hugger = null;
  e.holding = false;
  e.busyTo = g.t + RECOVER;
  if (byYork) gainTrust(g, 'freeHug');
}

// ---------- heroes ----------
function updateHero(g, h, inp) {
  const s = h.s;
  while (h.chan < s.channel?.max && g.t >= h.chanAt) { h.chan++; h.chanAt += s.channel.regen; }
  if (s.chains) {   // พันธนาการรัก ลด 1 ทุก 6 วิ (ความรักที่ปฏิเสธ: เร็วขึ้นเท่าตัว) ไม่ต่ำกว่าที่กระถางต้องสาปตรึงไว้
    const decay = s.chains.decay / (hasFeat(h, 'loveDenied') ? 2 : 1);
    if (h.stacks > h.chainFloor && g.t - h.stackAt >= decay) { h.stacks--; h.stackAt = g.t; }
    h.stacks = Math.max(h.stacks, h.chainFloor);
  }
  if (h.down) return deathSaves(g, h);
  if (h.swallowed) return;   // อยู่ในตัวบอส รอ York ดึงออก

  const press = inp.dodge && !h.prevDodge;
  h.prevDodge = inp.dodge;
  if (h.hugger) {   // Restrained: เดินและยิงไม่ได้ · กด dodge 3 ครั้งหลุด
    if (press && ++h.mash >= h.hugger.s.hug.mash) release(g, h.hugger, false);
    else if (g.t >= h.restrainTo) release(g, h.hugger, false);
    if (h.hugger) return;
  }
  if (interact(g, h, inp.hold)) return;
  if (g.t < h.lockTo) return;
  if (inp.dodge && g.t >= h.dodgeAt) return dodge(g, h, inp.dir || h.face);
  if (inp.face) h.face = inp.face;
  if (inp.skill) skill(g, h, inp.skill);
  if (inp.dir) {
    h.face = inp.dir;
    if (g.t >= h.t1) step1(g, h, inp.dir);
  }
  if (inp.attack && g.t >= h.atkAt) attack(g, h);
}

const moveTime = h => h.s.move * (1 + (h.s.chains?.slow ?? 0) * h.stacks);

function step1(g, h, [dx, dy]) {
  const x = h.x + dx, y = h.y + dy, e = who(g, x, y);
  if (free(g, x, y)) return moveTo(g, h, x, y, moveTime(h));
  if (charAt(g.room, x, y) === 'D' && !h.ai) return tryDoor(g, x, y);   // เดินชนประตู = ไปห้องถัดไป
  const p = partnerOf(g, h);   // ผู้เล่นเดินชนคู่หู = สลับช่องกัน (คู่หูขวางประตูไม่ได้)
  if (e === p && !h.ai && !p.down && !p.hugger && g.t >= p.t1) {
    moveTo(g, p, h.x, h.y, moveTime(p));
    return moveTo(g, h, x, y, moveTime(h));
  }
  // คนรับใช้คำนับ: หลบทางให้ "นายน้อย" Atez (สลับช่องกัน)
  if (h.kind === 'atez' && e?.s?.servant && !e.windup && g.t >= e.t1) {
    moveTo(g, e, h.x, h.y, moveTime(h));
    moveTo(g, h, x, y, moveTime(h));
  }
}

// GDD: dodge พุ่งตามจำนวนช่อง i-frame เฉพาะครึ่งแรก ครึ่งหลังโดนดาเมจได้
function dodge(g, h, dir) {
  const { cells, iframe, cd } = h.s.dodge;
  let [x, y] = [h.x, h.y];
  for (let i = 0; i < cells && free(g, x + dir[0], y + dir[1]); i++) { x += dir[0]; y += dir[1]; }
  g.fx.push({ kind: 'dodge', x: h.x, y: h.y, t: g.t });
  moveTo(g, h, x, y, iframe * 2);
  h.face = dir;
  h.iframeTo = g.t + iframe;
  h.lockTo = g.t + iframe * 2;
  h.dodgeAt = g.t + cd;
}

function firstEnemy(g, h, range) {
  for (const [x, y] of line(g, h.x, h.y, h.face, range, BLOCK_SHOT)) {
    const e = who(g, x, y);
    if (e?.side === 'enemy') return e;
  }
  return null;
}

function skill(g, h, name) {
  const s = h.s;
  if (name === 'vow' && h.chan > 0) {
    const target = [firstEnemy(g, h, s.vow.range)].concat(
      g.enemies.filter(e => active(e) && cheb(e, h) <= s.vow.range).sort((a, b) => cheb(a, h) - cheb(b, h)),
    ).find(e => e && active(e));
    if (!target) return;
    if (h.chan === s.channel.max) h.chanAt = g.t + s.channel.regen;
    h.chan--;
    h.vow = { target, until: hasRelic(h, 'vengeance') ? Infinity : g.t + s.vow.dur };   // คำสาบานแห่งการแก้แค้น: ค้างจนเป้าตาย
    bark(g, 'york', 'york.vow');
  } else if (name === 'stone' && h.s.stone && g.t >= h.stoneAt) {   // Stone's Endurance (reaction)
    h.stoneTo = g.t + h.s.stone.window;
    h.stoneAt = g.t + h.s.stone.cd;
  } else if (name === 'smite' && h.smiteLeft > 0) {
    h.smiteArmed = true;
  } else if (name === 'grab' && g.t >= h.grabAt) {
    const e = who(g, h.x + h.face[0], h.y + h.face[1]);
    if (e?.kind === 'atez' && holdAtez(g, h, e)) return;   // จับ Atez ไว้ตอนบอสดูด
    if (e?.side !== 'enemy' || !active(e) || e.s.elite || e.s.size || e.kind === 'pustule' || e.kind === 'heart' || g.t < e.parryTo) return;
    h.grabAt = g.t + s.grab.cd;
    cancel(g, e);
    if (e.holding) release(g, e, true);
    const far = s.grab.throw + (hasRelic(h, 'gauntlets') ? 1 : 0);   // Gauntlets: โยนไกล +1
    let n = 0;
    while (n < far && free(g, e.x + h.face[0] * (n + 1), e.y + h.face[1] * (n + 1))) n++;
    moveTo(g, e, e.x + h.face[0] * n, e.y + h.face[1] * n, 0.15);
    e.busyTo = Math.max(e.busyTo, e.t1);
    if (n < far) strike(g, h, e, s.grab.dice, h.face, { stun: s.grab.stun });   // ชนกำแพงหรือของ = Stunned + 1d6
  } else if (name === 'dash' && hasFeat(h, 'forgetPlan') && g.t >= h.dashAt && h.vow && active(h.vow.target)) {
    // Feat ลืมแผน: พุ่ง 3 ช่องเข้าหาเป้า Vow ชนทุกตัวที่ขวาง 1d8 + Prone
    const f = FEAT.forgetPlan, dir = toward(h, h.vow.target);
    h.dashAt = g.t + f.cd;
    h.face = dir;
    const path = line(g, h.x, h.y, dir, f.cells, BLOCK_MOVE);
    const stop = path.findIndex(([x, y]) => who(g, x, y));   // พุ่งจนชนตัวแรก
    const hit = stop >= 0 && who(g, ...path[stop]);
    if (hit?.side === 'enemy') strike(g, h, hit, f.dice, dir, { stun: f.prone });
    const n = stop < 0 ? path.length : stop;
    if (n) moveTo(g, h, h.x + dir[0] * n, h.y + dir[1] * n, 0.15);
  } else if (name === 'bane' && h.pactLeft > 0) {   // Bane: ศัตรูใน 3×3 รอบเป้า ดาเมจ −1d4 นาน 10 วิ
    const b = s.pact.bane;
    const target = firstEnemy(g, h, b.range) ?? g.enemies.filter(e => active(e) && cheb(e, h) <= b.range).sort((a, c) => cheb(a, h) - cheb(c, h))[0];
    if (!target) return;
    for (const e of g.enemies) if (active(e) && cheb(e, target) <= 1) e.baneTo = g.t + b.dur;
    g.fx.push({ kind: 'bane', x: target.x, y: target.y, t: g.t });
    if (--h.pactLeft === 0 && hasRelic(h, 'rod') && !h.rodUsed) { h.pactLeft = RELICS.rod.pact; h.rodUsed = true; }   // Rod: ฟื้น 1 ครั้งต่อชั้น
  } else if (name === 'dread' && h.dreadLeft > 0 && g.t >= h.dreadTo) {
    h.dreadLeft--;
    h.dreadTo = g.t + s.dread.dur;
    h.temp = roll(g, s.dread.temp);
  } else if (name === 'bell' && hasRelic(h, 'bell') && !g.bellUsed) {   // กระดิ่ง: คนรับใช้ทั้งห้อง Charmed 3 วิ
    g.bellUsed = true;
    for (const e of g.enemies) if (active(e) && e.s.servant) { e.charmTo = g.t + BELL.charm; cancel(g, e); }
  }
}

function attack(g, h) {
  const a = h.s.attack, [dx, dy] = h.face;
  const front = who(g, h.x + dx, h.y + dy);
  h.atkAt = g.t + a.cd;
  if (front?.kneel) return finish(g, front, h);   // ปิด elite ที่คุกเข่า (ต้องยืนติด)
  if (a.kind === 'melee') {
    g.fx.push({ kind: 'swing', x: h.x + dx, y: h.y + dy, t: g.t });
    if (front?.side !== 'enemy') return;
    const smite = h.smiteArmed && h.smiteLeft > 0;
    const bonus = a.dice[2] + (hasRelic(h, 'gauntlets') ? 1 : 0);   // Gauntlets: ประชิด +1
    const dice = smite ? [a.dice[0] + h.s.smite.dice[0], a.dice[1], bonus] : [a.dice[0], a.dice[1], bonus];
    if (strike(g, h, front, dice, h.face, { smite }) && smite) { h.smiteLeft--; h.smiteArmed = false; }
    return;
  }
  // ลำแสง: หยุดที่ศัตรูตัวแรกหรือสิ่งที่บังกระสุน ทะลุฮีโร่อีกตัว · Spell Sniper ทะลุศัตรูตัวแรก
  const pierce = hasFeat(h, 'spellSniper') ? 2 : 1, targets = [];
  let end = [h.x, h.y];
  for (const c of line(g, h.x, h.y, h.face, a.range, BLOCK_SHOT)) {
    end = c;
    const e = who(g, c[0], c[1]);
    if (e?.side === 'enemy' && targets.push(e) >= pierce) break;
  }
  const dread = g.t < h.dreadTo && h.s.dread;
  g.fx.push({ kind: 'beam', x: h.x, y: h.y, x2: end[0], y2: end[1], t: g.t, dread: !!dread });
  const rod = hasRelic(h, 'rod') ? 1 : 0;   // Rod of the Pact Keeper +1 · Spell DC 19
  const dice = [a.dice[0] + (dread ? dread.extra[0] : 0), a.dice[1], a.dice[2] + rod];   // Grave Touched +1d10 ต่อลำ
  for (const target of targets)
    for (let i = 0; i < a.beams && active(target); i++)
      if (strike(g, h, target, dice, h.face) && dread && i === 0 && d(g, 20) + ENEMY_WIS < dread.dc + rod) {
        target.fearTo = g.t + dread.fear;   // ลำแรกทำให้ Frightened
        cancel(g, target);
      }
}

// ---------- telegraphs ----------
export function windup(g, e, name, dir, cells, color = 'dmg', keepCd = false) {
  const m = e.s[name];
  const alert = g.heroes.some(h => hasFeat(h, 'alert')) ? FEAT.alert.warn : 0;   // Alert: ช่องเตือนขึ้นเร็วขึ้น
  if (dir) e.face = dir;
  if (!keepCd) e.ready[name] = g.t + m.cd;
  e.windup = { name, dir, cells, color, start: g.t, at: g.t + m.warn + alert, owner: e };
  g.danger.push(e.windup);   // DangerMap: ศัตรูเขียน ผู้เล่นและ AI อ่าน
}

const HOUSE = { kind: 'house', side: 'house', relics: [], passives: [], feats: [], face: [0, 0] };

function resolve(g, w) {
  const [york, atez] = g.heroes;
  if (w.hazard) return resolveHazard(g, w, (cells, dice) => {
    for (const [x, y] of cells) { const e = who(g, x, y); if (e?.side === 'enemy') strike(g, HOUSE, e, dice, [0, 0]); }
    g.fx.push({ kind: 'strike', cells, color: 'dmg', t: g.t });
  });
  const e = w.owner;
  g.heroes.forEach((h, i) => {   // ตัววัด M2: AI ยืนในช่องเตือนตอนท่าทำงาน (ไม่นับการตั้งใจบังให้ York)
    if (!h.ai80 || h.down || h.swallowed || w.color === 'heal' || w.color === 'spawn'
      || (h.kind === 'york' && w.color === 'ctrl') || h.shieldFor === w) return;
    g.stats.ai[i].n++;
    if (has(w.cells, h) && g.t >= h.iframeTo) g.stats.ai[i].in++;
  });
  e.windup = null;
  if (w.boss) return resolveBoss(g, w);   // ท่าของบอสและลูกน้ำ
  const m = e.s[w.name];
  e.busyTo = g.t + RECOVER;
  g.fx.push({ kind: 'strike', cells: w.cells, color: w.color, t: g.t });

  if (w.color === 'heal') {
    for (const k of g.enemies)
      if (active(k) && k.s.family && (k !== e || m.self) && cheb(k, e) <= m.radius) k.hp = Math.min(k.maxHp, k.hp + m.heal);
    return;
  }
  if (w.color === 'ctrl') {
    if (has(w.cells, atez) && g.t >= atez.iframeTo && !atez.down && !atez.hugger) restrain(g, atez, e);
    return;
  }
  // บังด้วยความรัก: Atez ยืนในช่องเตือนตอนท่าทำงาน → ศัตรูยกเลิกทั้งท่า
  if (!atez.down && has(w.cells, atez)) { shield(g, atez); e.chain = 0; return; }
  g.stats.warned++;
  const hit = has(w.cells, york) && g.t >= york.iframeTo;
  if (hit) g.stats.hit++;
  if (w.name === 'fan') {   // หมอกโรคค้าง ดาเมจทุก 0.5 วิ
    g.zones.push({ cells: w.cells, until: g.t + m.zone, next: g.t, m });
    return;
  }
  if (hit) hurt(g, york, baned(g, e, rollDis(g, m.dice, g.t < e.poisonTo)));
  if (w.name !== 'charge' && w.name !== 'lunge') return;
  if (hit && w.name === 'charge' && !york.down && free(g, york.x + w.dir[0], york.y + w.dir[1])) {   // ผลักถอย 1 ช่อง
    moveTo(g, york, york.x + w.dir[0], york.y + w.dir[1], 0.1);
    york.lockTo = Math.max(york.lockTo, g.t + 0.1);
  }
  let n = 0;   // พุ่งไปจนสุดเส้นหรือชนของ
  while (n < m.len && free(g, e.x + w.dir[0] * (n + 1), e.y + w.dir[1] * (n + 1))) n++;
  if (n) { moveTo(g, e, e.x + w.dir[0] * n, e.y + w.dir[1] * n, 0.15); e.busyTo = e.t1 + RECOVER; }
  if (w.name === 'lunge' && --e.chain > 0) {   // พี่ชาย: แทงครั้งที่สองหักมุม 90° เข้าหา York
    const dir = w.dir[0] ? [0, Math.sign(york.y - e.y) || 1] : [Math.sign(york.x - e.x) || 1, 0];
    e.busyTo = 0;
    windup(g, e, 'lunge', dir, line(g, e.x, e.y, dir, m.len, BLOCK_MOVE), 'dmg', true);
  }
}

// ---------- tick ----------
// inp = { dir, face, attack, dodge, hold, skill, cmd, choose } จากผู้เล่น · AI สร้าง inp แบบเดียวกันเอง
export function step(g, inp, dt) {
  if (g.modal) { if (inp.choose != null) choose(g, inp.choose); return; }   // หน้าต่างเลือกเปิดอยู่ = หยุดเกม
  if (g.state === 'fail' || g.state === 'over') return;   // ภาพค้างที่วินาทีที่แพ้ (รอ DM เล่าใหม่) หรือจบ run
  g.t += dt;
  g.dt = dt;
  g.fx = g.fx.filter(f => g.t - f.t < 1);
  if (inp.cmd) command(g, inp.cmd);
  if (g.cmdTarget && !active(g.cmdTarget)) { g.cmd = 'follow'; g.cmdTarget = null; }

  const room = g.roomId;
  for (const [i, h] of g.heroes.entries()) {
    h.ai80 = i !== g.ctrl;
    h.ai = g.ai && (h.ai80 || g.autopilot);
    updateHero(g, h, h.ai ? think(g, h) : h.ai80 ? {} : inp);
    if (g.roomId !== room) return;   // เดินผ่านประตูไปห้องใหม่แล้ว
  }
  if (!g.heroes[g.ctrl].down) fireWeapons(g, g.heroes[g.ctrl]);
  for (const e of g.enemies) if (active(e)) updateEnemy(g, e);
  updateHazards(g);
  for (const w of g.danger.filter(w => g.t >= w.at)) {
    g.danger.splice(g.danger.indexOf(w), 1);
    resolve(g, w);
  }
  const york = g.heroes[0];
  plague(g, g.heroes[1]);
  for (const z of g.zones) if (g.t >= z.next) {
    z.next += z.m.tick;
    if (has(z.cells, york) && g.t >= york.iframeTo) hurt(g, york, roll(g, z.m.dice), 'zone');
  }
  g.zones = g.zones.filter(z => g.t < z.until);
  swarm(g, york);
  const atez = g.heroes[1];
  if (hasRelic(york, 'secretShared') && cheb(york, atez) > RELICS.secretShared.far)   // ความลับที่ถือร่วมกัน: ห่างเกิน 6 ช่อง = Poisoned
    for (const h of g.heroes) h.poisonTo = Math.max(h.poisonTo, g.t + 0.5);
  if (g.boss && active(g.boss)) g.bossT += dt;

  if (g.heroes.every(h => h.down) || g.heroes.some(h => h.down?.fail >= 3)
    || (g.boss && active(g.boss) && atez.down && g.t - atez.down.since > BOSS.plague.limit)) { g.state = 'fail'; return; }   // ไฟต์บอส: Atez ล้มเกิน 10 วิ = แพ้
  if (!g.rs.cleared && g.enemies.length && !g.enemies.some(active)) {   // elite ที่คุกเข่ารอปิดไม่นับ
    if (g.plan && g.wave < g.plan.waves.length - 1) { g.wave++; spawnWave(g); return; }
    roomCleared(g);
  }
}

// [เสนอ] Atez ปล่อยซากศพรุม York: ศัตรู ≥2 ตัวติด York ต่อเนื่อง 6 วิ และ Atez ไม่ได้ยิงตัวไหนในช่วงนั้น
function swarm(g, york) {
  const near = g.enemies.filter(e => active(e) && cheb(e, york) === 1);
  const helped = near.some(e => g.t - e.atezHitAt < SWARM.time);
  g.swarmT = near.length >= SWARM.count && !helped && !york.down ? g.swarmT + g.dt : 0;
  if (g.swarmT >= SWARM.time) { gainTrust(g, 'swarm'); g.swarmT = 0; }
}

// คำสั่งคู่หู: ตามมา / รอตรงนี้ / โจมตีเป้านี้ (เป้า = ศัตรูตัวแรกตามทิศที่หัน หรือตัวที่ใกล้ที่สุด)
function command(g, cmd) {
  if (cmd !== 'target') { g.cmd = cmd; g.cmdTarget = null; return; }
  const me = g.heroes[g.ctrl];
  const t = firstEnemy(g, me, 8) ?? g.enemies.filter(active).sort((a, b) => cheb(a, me) - cheb(b, me))[0];
  if (t) { g.cmd = 'target'; g.cmdTarget = t; }
}
