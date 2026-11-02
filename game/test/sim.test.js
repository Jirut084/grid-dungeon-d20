// รัน: node game/test/sim.test.js — หยุดทันทีถ้ากฎหลักพัง
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseRoom } from '../src/room.js';
import { createGame, step, strike, baned, openModal, spawnWave } from '../src/sim.js';
import { retell, openCheck, enterRoom } from '../src/world.js';
import { gainXp, attune } from '../src/gear.js';
import { startConfrontation, contest } from '../src/story.js';
import { BOSS } from '../src/data.js';
import { ART, VARIANTS } from '../src/sprites.js';

const DT = 1 / 60;
const run = (g, inp, until) => { for (let i = 0; i < 600 && !until(g); i++) step(g, inp, DT); };
const solo = text => createGame(parseRoom(text), { ai: false });   // ตัวที่ไม่ได้คุมยืนนิ่ง

// 1) ห้องจริงทุกห้องโหลดได้ (รวมคลื่นและ elite) และวางฮีโร่ 2 ตัวคนละช่อง
const dir = new URL('../../tools/rooms/', import.meta.url);
for (const f of readdirSync(dir)) {
  const g = createGame(parseRoom(readFileSync(new URL(f, dir), 'utf8')), { roomId: f.replace('.txt', '') });
  const [y, a] = g.heroes;
  assert.ok(y && a && (y.x !== a.x || y.y !== a.y), f);
  for (let i = 0; i < 60 * 20; i++) step(g, {}, DT);   // AI เล่นเอง 20 วิ ไม่พัง
}

// 2) ฟุตแมนห่าง 2 ช่องแนวเดียวกัน → พุ่งชน ยืนเฉยโดน + ถูกผลัก / dodge ออกจากเส้น = ไม่โดน
const lane = `#########
#A......#
#.P.f...#
#.......#
#########`;
let g = solo(lane);
run(g, {}, g => g.danger.length);
assert.equal(g.danger[0].name, 'charge');
run(g, {}, g => !g.danger.length);
assert.ok(g.heroes[0].hp < 59 && g.stats.hit === 1);
assert.equal(g.heroes[0].x, 1);                       // ผลักถอย 1 ช่อง

g = solo(lane);
run(g, {}, g => g.danger.length);
step(g, { dir: [0, 1], dodge: true }, DT);
run(g, {}, g => !g.danger.length);
assert.equal(g.heroes[0].hp, 59);
assert.deepEqual([g.stats.warned, g.stats.hit], [1, 0]);

// 3) Eldritch Blast หยุดที่เสา ไม่หยุดถ้าไม่มีเสา
for (const [text, blocked] of [[`#######\n#A.p.f#\n#P....#\n#######`, true], [`#######\n#A...f#\n#P....#\n#######`, false]]) {
  g = solo(text);
  g.ctrl = 1;
  g.heroes[1].face = [1, 0];
  step(g, { attack: true }, DT);
  assert.equal(g.enemies[0].hp === 24, blocked, text);
}

// 4) บังด้วยความรัก: Atez ยืนในเส้นพุ่งชน → ท่ายกเลิก York ไม่โดน Atez ได้ 1 stack Trust +1
g = solo(`#########
#.......#
#.P.A.f.#
#.......#
#########`);
run(g, {}, g => g.danger.length);
run(g, {}, g => !g.danger.length);
assert.equal(g.heroes[0].hp, 59);
assert.deepEqual([g.heroes[1].stacks, g.trust], [1, 51]);

// 5) กอด: Atez ยืนติดญาติ 1.5 วิ → ช่องม่วง → Restrained · York ตีตัวที่กอด = หลุด Trust +2
g = solo(`#########
#P#.....#
###.....#
#....Ak.#
#########`);
run(g, {}, g => g.danger.length);
assert.equal(g.danger[0].color, 'ctrl');
run(g, {}, g => g.heroes[1].hugger);
const [york, kin] = [g.heroes[0], g.enemies[0]];
Object.assign(york, { x: kin.x + 1, y: kin.y, px: kin.x + 1, py: kin.y, face: [-1, 0] });
step(g, { attack: true }, DT);
assert.equal(g.heroes[1].hugger, null);
assert.equal(g.trust, 52);

// 6) AI Atez ตั้งใจบัง: York HP < 30% → Atez เดินเข้าเส้นพุ่งชน York ไม่โดน และไม่นับในตัววัด
for (const [hp, shields] of [[10, true], [59, false]]) {
  g = createGame(parseRoom(`#########
#.......#
#.P...f.#
#...A...#
#########`));
  g.heroes[0].hp = hp;
  g.enemies[0].hp = 999;                               // กันฟุตแมนตายก่อนลงท่า
  run(g, {}, g => g.danger.some(w => w.name === 'charge'));
  run(g, {}, g => !g.danger.some(w => w.name === 'charge'));
  assert.equal(g.heroes[1].stacks === 1, shields, `York hp ${hp}`);
  if (shields) assert.deepEqual([g.heroes[0].hp, g.stats.ai[1].in], [10, 0]);
}

// 7) ทั้งชั้น: ประตูล็อกตอนมีศัตรู · เคลียร์แล้วเดินชนประตูไปห้องถัดไป · แพ้ = เล่าห้องเดิมใหม่จากตอนเข้าห้อง
const all = Object.fromEntries(readdirSync(dir).map(f => [f.replace('.txt', ''), parseRoom(readFileSync(new URL(f, dir), 'utf8'))]));
g = createGame(all, { ai: false });
const door = (g, side) => g.room.rows.flatMap((r, y) => [...r].map((c, x) => ({ c, x, y })))
  .find(({ c, x, y }) => c === 'D' && (side === 'N' ? y === 0 : side === 'S' ? y === g.room.h - 1 : side === 'W' ? x === 0 : x === g.room.w - 1));
const bump = (g, side, dirv) => {
  const d = door(g, side);
  Object.assign(g.heroes[0], { x: d.x - dirv[0], y: d.y - dirv[1] });
  step(g, { dir: dirv }, DT);
};
bump(g, 'N', [0, -1]);
assert.equal(g.roomId, 'R0');                           // ฟุตแมนยังอยู่ = ประตูล็อก
for (const e of g.enemies) e.hp = 0;
step(g, {}, DT);
assert.ok(g.rs.cleared);
bump(g, 'N', [0, -1]);
assert.equal(g.roomId, 'R1');
const xpAtEntry = g.xp;
g.xp += 99;
g.heroes.forEach(h => { h.hp = 0; h.down = { since: g.t, next: 99, ok: 0, fail: 3, late: true }; });
step(g, {}, DT);
assert.equal(g.state, 'fail');
retell(g);
assert.deepEqual([g.roomId, g.state, g.xp, g.heroes[0].hp], ['R1', 'play', xpAtEntry, 59]);

// 8) skill check: ประตูห้องใต้ดิน ทอยแล้วประตูปลดล็อกทั้งสำเร็จและพลาด · การ์ดเลเวลอัปออก 3 ใบเลือกได้
openCheck(g, 'door');
step(g, { choose: 0 }, DT);
assert.equal(g.modal.kind, 'roll');
step(g, { choose: g.modal.options.length - 1 }, DT);
assert.ok(g.rs.done.lock);
while (g.modal) step(g, { choose: 0 }, DT);
gainXp(g, 3);
assert.equal(g.modal.kind, 'levelup');
assert.ok(g.modal.options.length === 3 && g.modal.options.filter(c => c.type === 'feat').length <= 1);
step(g, { choose: 0 }, DT);
assert.equal(g.modal, null);

// 9) บอส: ตุ่มแตกครบ = Exposed · HP ถึง 50% = เฟส 2 ตุ่มหาย และ checkpoint เล่าใหม่เริ่มเฟส 2
g = createGame(all, { ai: false });
enterRoom(g, 'R6');
const boss = g.boss;
for (const p of g.enemies.filter(e => e.kind === 'pustule')) { p.hp = 1; strike(g, g.heroes[0], p, [1, 1, 5], [0, 1]); }
assert.ok(boss.exposedTo > g.t && boss.hp < BOSS.hp);
boss.hp = BOSS.hp * BOSS.phase2;
step(g, {}, DT);
assert.equal(boss.phase, 2);
for (let i = 0; i < 60 * 15; i++) step(g, {}, DT);                 // เลยเวลางอกใหม่ 12 วิ ไปแล้ว
assert.ok(!g.enemies.some(e => e.kind === 'pustule' && e.hp > 0));  // เฟส 2 ตุ่มไม่งอกอีก
g.heroes.forEach(h => { h.hp = 0; h.down = { since: g.t, next: 99, ok: 0, fail: 3, late: true }; });
step(g, {}, DT);
retell(g);
assert.deepEqual([g.boss.phase, g.boss.hp, g.bossDeaths], [2, BOSS.hp * BOSS.phase2, 1]);

// 10) ฉากเผชิญหน้า: ทุกทางไปถึงฉากจบที่ถูกต้อง
const play = (ctrl, trust, picks) => {
  const s = createGame(all, { ai: false });
  Object.assign(s, { ctrl, trust });
  startConfrontation(s);
  for (let i = 0; s.modal && i < 200; i++) {
    const k = s.modal.kind;
    step(s, { choose: k in picks ? picks[k] : 0 }, DT);
  }
  return [s.ending, s.trust];
};
assert.equal(play(1, 60, { confront: 0 })[0], 'A');                // Atez สารภาพ + Trust ≥ 50
assert.equal(play(1, 45, { confront: 0 })[0], 'D');                // Atez สารภาพ + Trust < 50
assert.deepEqual(play(1, 60, { confront: 2 }), ['B', 50]);         // เงียบ = B และ Trust −10
assert.equal(play(0, 75, { forgive: 1 })[0], 'D');                 // York: AI สารภาพ → ผู้เล่นเลือกแยกทาง
assert.equal(play(0, 75, { forgive: 0 })[0], 'A');
assert.ok(['B', 'C'].includes(play(0, 50, {})[0]));                // York: AI โกหกและทอย
assert.deepEqual(play(0, 30, {}), ['B', 20]);                      // York: AI เงียบ
assert.equal(contest(g, 4, 10).win, false);                        // 4+10 = 10+4 เสมอ = โกหกพลาด

// 11) Relic ฉากจบติดตัวไป run ถัดไป
g = createGame(all, { legacy: ['oathNew'] });
assert.ok(g.heroes.every(h => h.relics.includes('oathNew')));
g = createGame(all, { legacy: ['vengeance', 'hollowShell'] });
assert.deepEqual([g.heroes[0].layPool, g.heroes[1].maxHp, g.heroes[1].dreadLeft], [15, 28, 4]);

// 12) Bane: ฟุตแมนติด Bane ดาเมจลดลง · Pact slot หมดแล้ว Rod ฟื้นให้ 1 ครั้ง
g = solo(lane);
const f = g.enemies[0];
Object.assign(g.heroes[1], { face: [1, 0], x: 1, y: 2, px: 1, py: 2 });
g.ctrl = 1;
g.heroes[1].relics.push('rod');
step(g, { skill: 'bane' }, DT);
step(g, { skill: 'bane' }, DT);
assert.ok(f.baneTo > g.t);
assert.deepEqual([g.heroes[1].pactLeft, g.heroes[1].rodUsed], [1, true]);
assert.ok(Array.from({ length: 50 }, () => baned(g, f, 3)).some(n => n < 3));

// 13) ถุง Relic: ช่องเต็มแล้วทิ้ง → เก็บลงถุง → จุดพักสลับคืนได้
g = createGame(all, { ai: false });
const yk = g.heroes[0];
for (const r of ['ring', 'gauntlets', 'seal']) yk.relics.push(r);
attune(g, yk, 'amulet');
step(g, { choose: 0 }, DT);                                       // ทิ้ง ring รับ amulet
assert.deepEqual([yk.relics.includes('amulet'), g.bag], [true, ['ring']]);
enterRoom(g, 'R5');
openModal(g, { kind: 'rest', options: [{ ok: true }, { swap: true }] });
step(g, { choose: 1 }, DT);
assert.equal(g.modal.kind, 'swap');

// 14) death save ทอยพลาด + มีแต้มโชค → ถามก่อนว่าจะทอยใหม่ไหม
g = solo(lane);
g.luck = 1;
g.heroes[0].hp = 0;
g.heroes[0].down = { since: 0, next: 0, ok: 0, fail: 0, late: true };
for (let i = 0; i < 60 * 30 && !g.modal; i++) step(g, {}, DT);
assert.equal(g.modal.kind, 'deathsave');
step(g, { choose: 0 }, DT);
assert.equal(g.luck, 0);

// 15) [ปรับจาก log] R2a มีคลื่น 2 เข้าทางประตู · ห้องเคลียร์เมื่อเหลือแค่ elite คุกเข่า (ยังปิดได้ตามเดิม)
g = createGame(all, { ai: false });
enterRoom(g, 'R2a');
for (const e of g.enemies) e.hp = 0;
step(g, {}, DT);
assert.deepEqual(g.enemies.filter(e => e.hp > 0).map(e => e.kind).sort(), ['footman', 'footman', 'kinsman']);
enterRoom(g, 'R4');
g.wave = 1;
g.enemies = [];
spawnWave(g);
const mom = g.enemies.find(e => e.kind === 'mother');
mom.hp = 1;
strike(g, g.heroes[1], mom, [1, 1, 5], [0, 1]);
while (g.modal) step(g, { choose: 0 }, DT);                         // elite ให้ XP 8 → การ์ดเลเวลอัป
step(g, {}, DT);
assert.ok(mom.kneel && g.rs.cleared);

// 17) ภาชนะแห่งโรคระบาด: Atez ล้มในห้องธรรมดา → โรคขยาย 0.5 ช่อง/วิ York ยืนในโซนเสีย HP · ชุบแล้วโซนหาย
g = solo(`#########
#.......#
#..AP...#
#.......#
#########`);
{
  const [york, atez] = g.heroes;
  atez.hp = 0; atez.down = { since: g.t, next: 99, ok: 0, fail: 0, late: false };
  for (let i = 0; i < 60 * 2 + 5; i++) step(g, {}, DT);
  const z = g.zones.find(z => z.plague);
  assert.ok(z && z.cells.length === 15, 'plague r=2 หลัง 2 วิ (ตัดกำแพง)');   // r = 1 + floor(2 × 0.5) → 5×3 ช่องในห้อง
  assert.ok(york.hp < 59, 'York ในโซนโรคเสีย HP');
  atez.down = null; atez.hp = 1;
  step(g, {}, DT);
  assert.ok(!g.zones.some(z => z.plague), 'ชุบแล้วโรคหาย');
}

// 16) asset ชั่วคราว: ทุกแถวกว้างเท่ากัน ทุกตัวอักษรมีสี ของในห้อง 16×16
for (const [n, { rows, pal }] of Object.entries(ART)) {
  assert.ok(rows.every(r => r.length === rows[0].length), `sprite ${n} rows`);
  for (const c of new Set(rows.join('').replace(/[.k]/g, ''))) assert.ok(c in pal, `sprite ${n} colour ${c}`);
  assert.deepEqual([rows[0].length, rows.length], [16, 16], `sprite ${n} 16×16`);   // ตัวละครและของในห้อง = 32×32 ทุกตัว
}
for (const [n, [base]] of Object.entries(VARIANTS)) assert.ok(ART[base], `variant ${n}`);
// ภาพจาก Aseprite: ชื่อไฟล์ต้องตรงกับชื่อ sprite ในเกม · ขนาด 32×32 (บอส 64×64) · ตัวที่เดินได้มี tag idle
const sheet = JSON.parse(readFileSync(new URL('../sprites/sheet.json', import.meta.url)));
for (const { filename, frame } of sheet.frames) {
  const [n] = filename.split('#'), px = n === 'boss' ? 64 : 32;
  assert.ok(ART[n] || VARIANTS[n] || n === 'boss', `sheet ${filename}: ไม่มี sprite ชื่อนี้`);
  assert.deepEqual([frame.w, frame.h], [px, px], `sheet ${filename} ${px}×${px}`);
}
for (const n of new Set(sheet.frames.map(f => f.filename.split('#')[0])))
  assert.ok(sheet.frames.some(f => f.filename.startsWith(n + '#idle') || f.filename.startsWith(n + '##')), `sheet ${n}: ไม่มี tag idle`);   // ไม่มี tag = idle

console.log('sim ok');
