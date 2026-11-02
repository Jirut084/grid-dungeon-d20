// คฤหาสน์ทั้งชั้น: ย้ายห้องผ่านประตู เก็บสถานะห้อง ของที่กด E ได้ หน้าต่างเลือก (modal) และเล่าห้องใหม่
// GDD-MVP "ห้องในคฤหาสน์", "DC ในคฤหาสน์", GDD หมวด 8 (Speak with Dead)
import {
  ROOMS, SPAWN, LINKS, CHECKS, EVENTS, LOCKED, CHESTS, POTION, POISON, PRAY, SPEAK, REST, CHANDELIER,
  STOVE, SUMMON_ON_FAIL, FEAT, DOWN, CLEAR_HEAL, CLEAR_REWARD, PASSIVES, RELICS, BOSS,
} from './data.js';
import { BLOCK_MOVE, charAt, find } from './room.js';
import { DIRS, cheb, active, partnerOf } from './grid.js';
import { makeEnemy, spawn, spawnWave, gainTrust, bark, roll, d, openModal, closeModal, applySave } from './sim.js';
import { attune, addRelic, dropRelic, setWeapon, setPassive, takeCard, heroOf, hasFeat, hasRelic, level } from './gear.js';
import { spawnBoss, litPlate, sealBoss } from './boss.js';
import { startConfrontation, afterScene, decide, contest, ending } from './story.js';

const key = (x, y) => x + ',' + y;
const NEAR = [[0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// ---------- ห้องและประตู ----------
export const doorSide = (room, x, y) => (x === 0 ? 'W' : x === room.w - 1 ? 'E' : y === 0 ? 'N' : 'S');
const open = (room, p) => !BLOCK_MOVE.includes(charAt(room, p.x, p.y)) && !SPAWN[charAt(room, p.x, p.y)];
const inward = (room, c) => DIRS.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).find(p => open(room, p));

export function enterRoom(g, id, side) {
  const room = g.rooms[id];
  Object.assign(g, {
    roomId: id, room, plan: ROOMS[id], rs: (g.roomStates[id] ??= { cleared: false, done: {} }),
    enemies: [], danger: [], zones: [], fx: [], wave: 0, state: 'play', enteredAt: g.t,
    cmdTarget: null, lastTarget: null, swarmT: 0, bellUsed: false, boss: null, onCheckpoint: checkpoint,
    stoveAt: find(room, 'h').length ? g.t + STOVE.period : Infinity,
    stats: { warned: 0, hit: 0, lost: 0, clearT: 0, ai: g.stats?.ai ?? [{ in: 0, n: 0 }, { in: 0, n: 0 }] },
  });
  // วางฮีโร่: ติดประตูที่เดินเข้ามา · ห้องแรกใช้ P/A ในไฟล์
  const door = side && find(room, 'D').find(c => doorSide(room, c.x, c.y) === side);
  const p = find(room, 'P')[0], a = find(room, 'A')[0];
  const york = door ? inward(room, door) : p ?? inward(room, find(room, 'D')[0]);
  const atez = !door && a ? a : DIRS.map(([dx, dy]) => ({ x: york.x + dx, y: york.y + dy })).find(c => open(room, c));
  place(g, g.heroes[0], york);
  place(g, g.heroes[1], atez);
  if (!g.rs.cleared) {
    for (const [ch, kind] of Object.entries(SPAWN)) for (const c of find(room, ch)) g.enemies.push(makeEnemy(g, kind, c));
    spawnWave(g);
    spawnBoss(g);
    if (!g.enemies.length) g.rs.cleared = true;   // ห้องที่ไม่มีศัตรู
  }
  if (g.heroes.some(h => hasFeat(h, 'alert'))) for (const e of g.enemies) e.busyTo += FEAT.alert.wait;   // Alert
  g.snap = { side, data: JSON.stringify(saveable(g)) };   // จุดเล่าใหม่เมื่อแพ้
}

function place(g, h, c) {
  Object.assign(h, {
    x: c.x, y: c.y, px: c.x, py: c.y, t0: g.t, t1: g.t, lockTo: 0, iframeTo: 0, hold: null,
    vow: null, quirk: null, hugger: null, restrainTo: 0, shieldFor: null, thinkAt: 0, swallowed: null, heldTo: 0,
  });
}

const saveable = g => ({
  heroes: g.heroes.map(h => ({ ...h, vow: null, quirk: null, hugger: null, hold: null, shieldFor: null, swallowed: null })),
  xp: g.xp, level: g.level, luck: g.luck, trust: g.trust, trustSum: g.trustSum, trustLog: g.trustLog,
  roomStates: g.roomStates, journal: g.journal, prayed: g.prayed, spoken: g.spoken, kills: g.kills, cmd: g.cmd, bag: g.bag,
});

// DM เล่าฉากนั้นใหม่: กลับไปสถานะตอนเข้าห้องนี้
export function retell(g) {
  if (g.boss) g.bossDeaths++;   // ตัววัด: ตายที่บอสก่อนชนะ
  Object.assign(g, JSON.parse(g.snap.data), { modal: null, queue: [] });
  enterRoom(g, g.roomId, g.snap.side);
}

// บอสเข้าเฟส 2: เล่าใหม่จากต้นเฟส 2 (ค่าฮีโร่ยังเป็นตอนเข้าห้อง)
function checkpoint(g) {
  const s = JSON.parse(g.snap.data);
  s.roomStates[g.roomId].bossPhase = 2;
  g.snap.data = JSON.stringify(s);
}

export function tryDoor(g, x, y) {
  const side = doorSide(g.room, x, y), link = LINKS[g.roomId]?.[side];
  if (link === undefined) return;   // ห้องทดสอบเดี่ยว
  if (!link) return bark(g, 'dm', 'dm.sealed');
  if (g.enemies.some(active)) return bark(g, 'dm', 'dm.locked');
  if (g.heroes.some(h => h.down)) return bark(g, 'dm', 'dm.downed');
  if (LOCKED[g.roomId]?.side === side && !g.rs.done.lock) return openCheck(g, LOCKED[g.roomId].check);
  enterRoom(g, link[0], link[1]);
}

export const doorOpen = (g, x, y) => {
  const side = doorSide(g.room, x, y);
  return !!LINKS[g.roomId]?.[side] && !g.enemies.some(active) && (LOCKED[g.roomId]?.side !== side || !!g.rs.done.lock);
};

// เคลียร์ห้อง: ฟื้น HP 25% · ของรางวัลห้อง
export function roomCleared(g) {
  g.rs.cleared = true;
  g.stats.clearT = g.t - g.enteredAt;
  const { ai, ...stats } = g.stats;
  g.log.push({ room: g.roomId, ...stats });
  for (const h of g.heroes) if (!h.down) h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * CLEAR_HEAL));
  if (g.boss) return startConfrontation(g);   // ชนะบอส → ฉากเผชิญหน้า
  bark(g, 'dm', 'dm.clear');
  const reward = CLEAR_REWARD[g.roomId];
  if (reward && !g.rs.done.reward) { g.rs.done.reward = true; giveRelic(g, g.heroes[1], reward); }
}

// เตาไฟ R2b: เตือน 0.6 วิ → ไฟลุกช่องใต้เตา 3 วิ → ดับ 3 วิ [เสนอ]
export function updateHazards(g) {
  if (g.t < g.stoveAt) return;
  const cells = find(g.room, 'h').map(c => [c.x, c.y + 1]).filter(([x, y]) => !BLOCK_MOVE.includes(charAt(g.room, x, y)));
  g.danger.push({ hazard: 'stove', cells, color: 'dmg', start: g.t, at: g.t + STOVE.warn, owner: null });
  g.stoveAt = g.t + STOVE.warn + STOVE.period * 2;
}

// ท่าของบ้าน (ไม่ใช่ศัตรู) ทำงานแล้ว — เรียกจาก resolve ใน sim
export function resolveHazard(g, w, strikeAll) {
  if (w.hazard === 'stove') g.zones.push({ cells: w.cells, until: g.t + STOVE.period, next: g.t, m: STOVE, fire: true });
  if (w.hazard === 'chandelier') strikeAll(w.cells, CHANDELIER.dice);
}

// ---------- ของที่กด E ได้ ----------
// คืนสิ่งที่ฮีโร่ตัวนี้กด E ได้ตอนนี้ (ใช้ทั้งในเกม AI และป้ายบอกใน HUD)
export function interactable(g, h) {
  const p = partnerOf(g, h), done = g.rs.done;
  if (p.down && cheb(h, p) === 1) return { kind: 'revive', target: p };
  const plate = litPlate(g);   // ผนึก: York ยืนบนแผ่นที่สว่าง + Channel Divinity
  if (h.kind === 'york' && plate && plate.x === h.x && plate.y === h.y && h.chan > 0 && g.t >= g.boss.slowTo) return { kind: 'seal' };
  for (const [dx, dy] of NEAR) {
    const x = h.x + dx, y = h.y + dy, ch = charAt(g.room, x, y), k = key(x, y);
    if (ch === 'X' && !done[k + 'speak']) return { kind: 'speak', x, y };
    if ((ch === 'K' || ch === 'X') && h.kind === 'york' && !done[k + 'pray']) return { kind: 'pray', x, y };
    if (ch === 'c' && CHESTS[g.roomId] && !done[k]) return { kind: 'chest', x, y };
    if (ch === 'e' && EVENTS[g.roomId] && !done[k]) return { kind: 'event', x, y };
    if (ch === 'r' && !done[k]) return { kind: 'rest', x, y };
    if (ch === 'L' && h.kind === 'atez' && !done[k]) return { kind: 'lever', x, y };
  }
  if (h.layPool > 0) {
    if (cheb(h, p) <= layReach(h) && !p.down && p.hp < p.maxHp && p.hp / p.maxHp <= h.hp / h.maxHp) return { kind: 'lay', target: p };
    if (h.hp < h.maxHp) return { kind: 'lay', target: h };
  }
  return null;
}

const HOLD = { revive: DOWN.revive, pray: PRAY.hold, seal: BOSS.seal.hold };
const layReach = h => (hasRelic(h, 'oathNew') ? RELICS.oathNew.layRange : 1);   // คำสาบานใหม่: Lay on Hands ถึง Atez จากระยะ 3   // กดค้าง (Lay on Hands ใช้เวลาของตัวเอง) · ที่เหลือกดครั้งเดียว

// กด E: กดครั้งเดียว = ใช้ของ · กดค้าง = ชุบ/สวด/Lay on Hands (โดนตีแล้วหลุด เว้นแต่มี War Caster)
export function interact(g, h, holding) {
  const press = holding && !h.prevHold;
  h.prevHold = holding;
  if (!holding) { h.hold = null; return false; }
  if (!h.hold) {
    const it = press && interactable(g, h);
    if (!it) return false;
    if (it.kind !== 'lay' && !(it.kind in HOLD)) { use(g, h, it); return true; }
    h.hold = { ...it, start: g.t, until: g.t + (HOLD[it.kind] ?? h.s.lay.hold) };
  }
  const hold = h.hold, { kind, target } = hold;
  if (target && target !== h && cheb(h, target) > (kind === 'lay' ? layReach(h) : 1)) { h.hold = null; return false; }
  if (g.t < hold.until) return true;
  h.hold = null;
  if (kind === 'revive' && target.down) {
    if (g.t - target.down.since <= DOWN.late) gainTrust(g, 'revive');
    target.down = null;
    target.hp = Math.round(target.maxHp * DOWN.reviveHp);
  } else if (kind === 'lay') {
    const n = Math.min(h.layPool, target.maxHp - target.hp);
    target.hp += n;
    h.layPool -= n;
    g.fx.push({ kind: 'heal', x: target.x, y: target.y, t: g.t });
    const p = partnerOf(g, h);   // ตราวิหาร: ฮีลตัวเองแล้วคู่หูในระยะ 2 ช่องได้ 50% ด้วย
    if (target === h && hasRelic(h, 'seal') && cheb(h, p) <= 2 && !p.down) p.hp = Math.min(p.maxHp, p.hp + Math.round(n / 2));
  } else if (kind === 'seal') {
    sealBoss(g, h);
  } else if (kind === 'pray') {
    g.rs.done[key(hold.x, hold.y) + 'pray'] = true;
    g.fx.push({ kind: 'heal', x: hold.x, y: hold.y, t: g.t });
    if (++g.prayed >= PRAY.total) gainTrust(g, 'pray');   // สวดครบ 7 ศพ = Trust +10
  }
  return true;
}

function use(g, h, it) {
  const k = key(it.x, it.y);
  if (it.kind === 'speak') { g.rs.done[k + 'speak'] = true; return speakWithDead(g); }
  g.rs.done[k] = true;
  if (it.kind === 'chest') {
    if (CHESTS[g.roomId] === 'pair')
      return openModal(g, { kind: 'pair', options: [{ pair: ['holyCross', 'blessCharm'] }, { pair: ['plagueSwarm', 'rottenTome'] }] });
    return giveRelic(g, g.heroes[g.ctrl], CHESTS[g.roomId]);
  }
  if (it.kind === 'event') {
    const ev = EVENTS[g.roomId];
    if (ev === 'censer') return openModal(g, { kind: 'censer', options: [{ take: true }, { take: false }] });
    return openCheck(g, ev);
  }
  if (it.kind === 'rest') return rest(g);
  if (it.kind === 'lever') {   // Atez ดึงคันโยก: โคมระย้าตกทับช่อง C
    const cells = find(g.room, 'C').map(c => [c.x, c.y]);
    g.danger.push({ hazard: 'chandelier', cells, color: 'dmg', start: g.t, at: g.t + CHANDELIER.warn, owner: null });
  }
}

// Speak with Dead: ศพพิเศษเผยความจริงทีละชิ้นตามลำดับที่เจอ
// เล่นเป็น Atez ได้ยินทุกคำแล้วเลือกเล่า/เก็บ/โกหก · เล่นเป็น York ได้คำตอบตามที่ AI Atez เลือกเล่า (ตาม Trust)
function speakWithDead(g) {
  const idx = ++g.spoken, truth = 'swd.' + idx;
  if (g.ctrl === 1) openModal(g, { kind: 'speak', idx, truth, options: [{ tell: 'tell' }, { tell: 'keep' }, { tell: 'lie' }] });
  else {
    const told = g.trust >= SPEAK.full || (g.trust >= SPEAK.part && idx <= SPEAK.partCount) ? 'tell' : 'lie';
    g.journal.corpses.push({ idx, truth, told });
    openModal(g, { kind: 'speak', idx, heard: told === 'tell' ? truth : 'swd.silent', options: [{ ok: true }] });
  }
  if (idx === 1) giveRelic(g, g.heroes[0], 'seal');   // ตราวิหารเปลวรุ่ง จากศพพิเศษศพที่ 1
}

function rest(g) {   // Short Rest: HP 50% · Channel Divinity คืนหมด · Smite และ Form of Dread คืน 1 ครั้ง
  for (const h of g.heroes) {
    if (h.down) { h.down = null; h.hp = 0; }
    h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * REST.heal));
    if (h.kind === 'york') { h.chan = h.s.channel.max; h.smiteLeft = Math.min(h.s.smite.uses, h.smiteLeft + 1); }
    else { h.dreadLeft = Math.min(h.s.dread.uses, h.dreadLeft + 1); h.pactLeft = h.s.pact.slots; }   // Pact slot ฟื้นทุก Short Rest
  }
  openModal(g, { kind: 'rest', options: [{ ok: true }, ...(g.bag.length ? [{ swap: true }] : [])] });   // สลับ Relic ได้อีกครั้งที่จุดพัก
}

export function giveRelic(g, h, id) {
  const hero = RELICS[id].who === 'any' ? h.kind : RELICS[id].who;
  openModal(g, { kind: 'loot', relic: id, hero, options: [{ ok: true }] });
  attune(g, h, id);
}

// ---------- skill check ----------
const chance = (bonus, dc) => Math.max(0.05, Math.min(0.95, (21 - (dc - bonus)) / 20));

export function openCheck(g, name) {
  openModal(g, {
    kind: 'check', check: name,
    options: CHECKS[name].map(o => {
      const h = heroOf(g, o.hero), bless = PASSIVES.blessCharm.check * level(h, 'blessCharm');
      const relic = hasRelic(h, 'truthVoice') && (o.skill === 'medicine' || o.skill === 'deception') ? RELICS.truthVoice.check : 0;   // CHA/WIS +2
      return { ...o, bless, relic, chance: chance(o.bonus + bless + relic, o.dc) };
    }),
  });
}

function rollCheck(g, opt, rolls = []) {
  const r = d(g, 20), total = r + opt.bonus + opt.bless + opt.relic;
  const ok = r === 20 || (r !== 1 && total >= opt.dc);
  g.modal = { kind: 'roll', check: g.modal.check, opt, r, total, ok, rolls: [...rolls, r], at: g.t,
    options: [...(!ok && g.luck > 0 ? [{ reroll: true }] : []), { ok: true }] };
}

function outcome(g, name, opt, ok) {
  const h = heroOf(g, opt.hero);
  if (name === 'medicine') {
    if (ok) return openModal(g, { kind: 'medicine', hero: opt.hero, options: [{ relic: 'gauntlets' }, { potion: true }] });
    h.poisonTo = g.t + POISON;
  } else if (name === 'ledger') {
    if (ok) { g.journal.notes.push('ledger'); return giveRelic(g, heroOf(g, 'atez'), 'rod'); }
    summonAtDoors(g, SUMMON_ON_FAIL.ledger);   // สาวใช้ 2 ตัวเข้ามา
  } else if (name === 'door') {
    g.rs.done.lock = true;   // สำเร็จ = ประตูเปิดเงียบ · พลาด = ประตูพัง ฟุตแมน 2 ตัวตามเสียงมา
    bark(g, 'dm', ok ? 'dm.doorQuiet' : 'dm.doorBroke');
    if (!ok) summonAtDoors(g, SUMMON_ON_FAIL.door);
  }
}

function summonAtDoors(g, kinds) {
  const doors = find(g.room, 'D');
  kinds.forEach((kind, i) => spawn(g, kind, inward(g.room, doors[i % doors.length])));
}

// ---------- หน้าต่างเลือก ----------
export function choose(g, i) {
  const m = g.modal, o = m?.options[i];
  if (!o) return;
  if (m.kind === 'check') return rollCheck(g, o);
  if (m.kind === 'roll' && o.reroll) { g.luck--; return rollCheck(g, m.opt, m.rolls); }
  if (m.kind === 'scene' && m.i < m.lines.length - 1) { g.modal = { ...m, i: m.i + 1 }; return; }   // บรรทัดถัดไป
  if (m.kind === 'contest' && o.reroll) {   // Lucky: ทอยลูกเต๋าฝั่งผู้เล่นใหม่
    g.luck--;
    g.modal = g.ctrl === 1 ? contest(g, d(g, 20), m.y) : contest(g, m.a, d(g, 20));
    return;
  }
  closeModal(g);
  if (m.kind === 'hero') g.ctrl = i;
  else if (m.kind === 'roll') outcome(g, m.check, m.opt, m.ok);
  else if (m.kind === 'levelup') takeCard(g, o);
  else if (m.kind === 'pair') { const h = g.heroes[g.ctrl]; setWeapon(h, o.pair[0], 2); setPassive(h, o.pair[1], 2); }
  else if (m.kind === 'medicine') {
    const h = heroOf(g, m.hero);
    if (o.relic) giveRelic(g, h, o.relic); else h.hp = Math.min(h.maxHp, h.hp + roll(g, POTION));
  } else if (m.kind === 'censer' && o.take) giveRelic(g, heroOf(g, 'atez'), 'censer');
  else if (m.kind === 'drop') {   // ชิ้นที่ทิ้ง (หรือชิ้นที่ไม่รับ) เก็บลงถุง สลับคืนได้ที่จุดพัก
    const h = heroOf(g, m.hero);
    if (o.drop) { dropRelic(h, o.drop); addRelic(h, m.relic); g.bag.push(o.drop); } else g.bag.push(m.relic);
  } else if (m.kind === 'rest' && o.swap) openModal(g, { kind: 'swap', options: [...g.bag.map(id => ({ relic: id })), { relic: null }] });
  else if (m.kind === 'swap' && o.relic) { g.bag.splice(g.bag.indexOf(o.relic), 1); attune(g, g.heroes[g.ctrl], o.relic); }
  else if (m.kind === 'deathsave') applySave(heroOf(g, m.hero), o.reroll ? (g.luck--, d(g, 20)) : m.r);
  else if (m.kind === 'scene') afterScene(g, m.then);
  else if (m.kind === 'confront') decide(g, o.pick);
  else if (m.kind === 'forgive') ending(g, o.end);
  else if (m.kind === 'contest') ending(g, m.win ? 'B' : 'C');
  else if (m.kind === 'speak' && o.tell) {
    g.journal.corpses.push({ idx: m.idx, truth: m.truth, told: o.tell });
    if (o.tell !== 'tell') gainTrust(g, 'lie');   // โกหกหรือเงียบในองก์ 2
  }
}

// สรุปตัววัดของ run เทียบเป้าใน GDD-MVP "การทดสอบ" (หน้าจบ run และบอท)
export function runSummary(g) {
  const rooms = g.log.filter(r => r.room !== 'R6' && r.warned > 0), sum = f => rooms.reduce((a, r) => a + f(r), 0);
  const warned = sum(r => r.warned), ai = g.stats.ai[1 - g.ctrl];
  return {
    roomTime: rooms.length ? sum(r => r.clearT) / rooms.length : 0,
    roomLost: rooms.length ? sum(r => r.lost) / rooms.length : 0,
    dodged: warned ? 1 - sum(r => r.hit) / warned : 1,
    bossTime: g.bossT, bossDeaths: g.bossDeaths, trust: g.trust, aiDanger: ai.n ? ai.in / ai.n : 0,
  };
}
