// AI คู่หู (GDD หมวด 10): กฎเรียงลำดับ ข้อแรกที่เข้าเงื่อนไขได้ทำ
// คืน input แบบเดียวกับที่ผู้เล่นกด จึงเล่นภายใต้กฎเดียวกันทุกอย่าง
// ponytail: priority list ตายตัว เปลี่ยนเป็น utility score ถ้ากฎตีกันเกิน ~8 ข้อ
import { AI } from './data.js';
import { BLOCK_SHOT, charAt, find } from './room.js';
import { cheb, manhattan, has, active, partnerOf, who, line, aligned, bfs, dangerSet, cellsOf, size } from './grid.js';

export function think(g, me) {
  if (me.down || me.hugger || me.swallowed) return {};   // Atez ถูกกอด: AI ไม่ดิ้นเอง ให้ York ได้เข้ามาช่วย
  if (me.hold) return { hold: true };
  if (g.t < me.t1 || g.t < me.lockTo || g.t < me.thinkAt) return {};
  me.thinkAt = g.t + AI.think;
  // บอทจำลอง "ผู้เล่นใหม่" (เฉพาะช่องของผู้เล่น): พลาดไม่หลบช่องเตือนตามสัดส่วน g.sloppy (balance.py ใช้ 30%)
  if (g.sloppy && !me.ai80) for (const w of g.danger) if (w.skip?.[me.kind] === undefined) w.skip = { ...w.skip, [me.kind]: g.rand() < g.sloppy };
  const ctx = { g, me, p: partnerOf(g, me), danger: dangerSet(g, me) };
  if (me.kind === 'atez') { const s = shield(ctx); if (s) return s; }
  // กฎร่วม: ยืนในช่องอันตราย → ไปช่องปลอดภัยที่ใกล้ที่สุดก่อนทำอย่างอื่น
  if (ctx.danger.has(me.x + me.y * g.room.w)) return escape(ctx);
  if (ctx.p.down) {   // ไปชุบคู่หู · ไปไม่ถึง (ศัตรูล้อม) → สู้เปิดทางตามกฎปกติ
    if (cheb(me, ctx.p) === 1) return { hold: true };
    const path = go(ctx, (x, y) => cheb({ x, y }, ctx.p) === 1);
    if (path.dir) return path;
  }
  return me.kind === 'york' ? york(ctx) : atez(ctx);
}

const dirTo = (me, [x, y]) => [x - me.x, y - me.y];
const nearest = (list, from) => list.reduce((a, b) => (!a || cheb(b, from) < cheb(a, from) ? b : a), null);

function go({ g, me, danger }, goal) {
  const s = bfs(g, me.x, me.y, goal, danger);
  return s ? { dir: dirTo(me, s.first) } : {};
}

function escape({ g, me, danger }) {
  const W = g.room.w;
  const safe = bfs(g, me.x, me.y, (x, y) => !danger.has(x + y * W));
  const soon = Math.min(9, ...g.danger
    .filter(w => w.cells.some(([x, y]) => x === me.x && y === me.y))
    .map(w => w.at - g.t));
  const dir = safe && dirTo(me, safe.first);
  // ก้าวแรกย้ายช่องทันที ก้าวถัดไปใช้เวลา — เดินไม่ทันค่อย dodge
  if ((!safe || (safe.dist - 1) * me.s.move > soon - 0.05) && g.t >= me.dodgeAt) {
    if (safe && safe.dist <= me.s.dodge.cells) return { dodge: true, dir };
    if (soon <= me.s.dodge.iframe) return { dodge: true, dir: me.face };   // ไม่มีที่หนี: dodge กับที่กิน i-frame
  }
  return dir ? { dir } : {};
}

// ตั้งใจบังด้วยความรัก: York HP < 30% และ stack < 3 → เดินเข้าช่องแดงที่เล็ง York ให้ทันก่อนท่าทำงาน
// me.shieldFor = ท่าที่ตั้งใจบัง (ไม่นับในตัววัด AI ยืนในช่องเตือน) · ช่องม่วง (กอด) ยังหนีตามกฎร่วม
function shield({ g, me, p: york }) {
  me.shieldFor = null;
  if (york.down || york.hp / york.maxHp >= AI.shield.hp || me.stacks >= AI.shield.stacks) return null;
  const W = g.room.w;
  const ctrl = new Set(g.danger.filter(w => w.color === 'ctrl').flatMap(w => w.cells.map(([x, y]) => x + y * W)));
  if (ctrl.has(me.x + me.y * W)) return null;
  const threats = g.danger.filter(w => w.color === 'dmg' && has(w.cells, york));
  const mine = threats.find(w => has(w.cells, me));
  if (mine) { me.shieldFor = mine; return {}; }   // ยืนบังอยู่แล้ว
  const s = bfs(g, me.x, me.y, (x, y) => threats.some(w => has(w.cells, { x, y })), ctrl);
  const w = s && threats.find(w => has(w.cells, s));
  const moveTime = me.s.move * (1 + me.s.chains.slow * me.stacks);
  if (!w || (s.dist - 1) * moveTime >= w.at - g.t) return null;   // ก้าวแรกย้ายช่องทันที
  me.shieldFor = w;
  return { dir: dirTo(me, s.first) };
}

// เข้าไปยืนติด (4 ทิศ) แล้วหันตีเป้า · เป้าปัดป้องอยู่และเรายืนหน้ามัน → อ้อมไปด้านข้าง · บอส 2×2 ยืนติดช่องไหนก็ได้
function engage(ctx, t, skill = null) {
  const { g, me } = ctx, cells = cellsOf(t);
  const front = (x, y) => size(t) === 1 && x === t.x + t.face[0] && y === t.y + t.face[1];
  const adj = cells.find(c => manhattan(me, c) === 1);
  if (adj) {
    if (g.t < t.parryTo && front(me.x, me.y)) {
      const side = go(ctx, (x, y) => manhattan({ x, y }, t) === 1 && !front(x, y));
      if (side.dir) return side;
    }
    return { face: [adj.x - me.x, adj.y - me.y], attack: true, skill };
  }
  return go(ctx, (x, y) => cells.some(c => manhattan({ x, y }, c) === 1));
}

// ไฟต์บอส (York): ดึง Atez จากแรงดูด → ตีบอสให้คาย Atez → หัวใจ → ผนึก → ลูกน้ำ → ตุ่มหนอง → ตัวบอส
function yorkBoss(ctx) {
  const { g, me, p } = ctx, b = g.boss;
  const sucking = b.suction || g.danger.some(w => w.name === 'suction');
  if (sucking && !p.swallowed && !p.down && g.t >= p.heldTo) {
    if (manhattan(me, p) === 1) return { face: [p.x - me.x, p.y - me.y], skill: 'grab' };   // "ข้าไม่ปล่อยเจ้าไป"
    const path = go(ctx, (x, y) => manhattan({ x, y }, p) === 1);
    if (path.dir) return path;
  }
  if (p.swallowed) return engage(ctx, b, me.smiteLeft > 0 && !me.smiteArmed ? 'smite' : null);
  const heart = g.enemies.find(e => e.kind === 'heart' && active(e));
  if (heart) return engage(ctx, heart);
  const plate = b.plates[b.lit];
  if (plate && me.chan > 0 && g.t >= b.slowTo && g.t >= b.exposedTo) {
    if (me.x === plate.x && me.y === plate.y) return { hold: true };
    const path = go(ctx, (x, y) => x === plate.x && y === plate.y);
    if (path.dir) return path;
  }
  const maggot = g.enemies.find(e => e.kind === 'maggot' && active(e) && cheb(e, me) <= 3);
  if (maggot) return engage(ctx, maggot);
  const pustule = nearest(g.enemies.filter(e => e.kind === 'pustule' && active(e)), me);
  return engage(ctx, pustule ?? b);
}

// AI York (แทงก์)
function york(ctx) {
  const { g, me, p } = ctx;
  const foes = g.enemies.filter(active);
  const low = p.hp / p.maxHp;
  if (g.boss && active(g.boss)) return yorkBoss(ctx);
  const onP = foes.filter(e => cheb(e, p) <= 1);
  if (low < 0.3 && onP.length) {                                     // 1. ขวางตัวที่ติด Atez + Vow
    const t = onP[0];
    return engage(ctx, t, me.chan > 0 && me.vow?.target !== t ? 'vow' : null);
  }
  if (low < 0.25 && me.layPool > 0)                                   // 2. Lay on Hands
    return cheb(me, p) === 1 ? { hold: true } : go(ctx, (x, y) => cheb({ x, y }, p) === 1);
  if (p.hugger) return engage(ctx, p.hugger);                         // ตีตัวที่กอด Atez ให้หลุด
  if (onP.length) {                                                   // 3. จับแล้วโยนออก
    const t = onP[0];
    return engage(ctx, t, g.t >= me.grabAt && !t.s.elite && g.t >= t.parryTo ? 'grab' : null);
  }
  if (g.cmd === 'wait') return holdGround(ctx, foes);
  quirk(ctx, foes);
  const target = (g.cmd === 'target' && g.cmdTarget)                  // 4. เป้าตามคำสั่ง > นิสัย > ตัวที่ผู้เล่นตี > ใกล้สุด
    || (me.quirk && g.t < me.quirk.until && active(me.quirk.target) && me.quirk.target)
    || (g.lastTarget && active(g.lastTarget) && g.lastTarget)
    || nearest(foes, me);
  if (target) {
    const skill = target.s.elite && me.smiteLeft > 0 && !me.smiteArmed ? 'smite'
      : target.maxHp >= 36 && me.chan > 0 && !(me.vow && g.t < me.vow.until) ? 'vow' : null;
    return engage(ctx, target, skill);
  }
  const kneel = g.enemies.find(e => e.kneel);                        // [เสนอ] ผู้เล่น Atez ไม่ปิด elite เกิน 5 วิ → York ปิด
  if (kneel && g.t - kneel.kneelAt > AI.finishWait) return engage(ctx, kneel);
  // ไม่มีศัตรู: สวดให้ศพอัศวินที่ยังไม่ได้สวด (ศพพิเศษ X ต้องให้ Atez คุยก่อน)
  const corpse = ['K', 'X'].flatMap(ch => find(g.room, ch))
    .find(c => !g.rs.done[c.x + ',' + c.y + 'pray'] && (charAt(g.room, c.x, c.y) === 'K' || g.rs.done[c.x + ',' + c.y + 'speak']));
  if (corpse && g.cmd !== 'wait') return cheb(me, corpse) === 1 ? { hold: true } : go(ctx, (x, y) => cheb({ x, y }, corpse) === 1);
  return cheb(me, p) > 2 ? go(ctx, (x, y) => cheb({ x, y }, p) <= 2) : {};   // ตามมา
}

function holdGround({ me }, foes) {
  const t = foes.find(e => manhattan(e, me) === 1);
  return t ? { face: [t.x - me.x, t.y - me.y], attack: true } : {};
}

// นิสัย York: บางครั้งพุ่งใส่ตัวใหญ่ตามใจ (ไม่ทำตอน Atez เลือดต่ำ)
function quirk({ g, me, p }, foes) {
  if (g.t < me.quirkAt) return;
  me.quirkAt = g.t + AI.quirk.cd;
  const big = foes.filter(e => e.maxHp >= 36).sort((a, b) => b.maxHp - a.maxHp)[0];
  if (!big || p.hp / p.maxHp < 0.3 || g.rand() >= AI.quirk.chance) return;
  me.quirk = { target: big, until: g.t + AI.quirk.dur };
  g.barks.push({ t: g.t, who: 'york', key: 'york.quirk' });
}

// ลำแสงจาก (x,y) โดนเป้าตัวนี้ก่อนศัตรูตัวอื่นไหม → ทิศที่ต้องหัน
function beamDir(g, me, x, y, t) {
  for (const c of cellsOf(t)) {
    const dir = aligned({ x, y }, c);
    if (!dir) continue;
    for (const [cx, cy] of line(g, x, y, dir, me.s.attack.range, BLOCK_SHOT)) {
      const e = who(g, cx, cy);
      if (e === t) return dir;
      if (e?.side === 'enemy') break;
    }
  }
  return null;
}

// AI Atez (ยิงไกล)
function atez(ctx) {
  const { g, me, p: york } = ctx;
  const foes = g.enemies.filter(active);
  const kneel = g.enemies.find(e => e.kneel);
  // elite คุกเข่า: ผู้เล่น York รอเกิน 5 วิ → ปิดเองเมื่อ Trust ≥ 60 นอกนั้นรอให้ York ทำ
  if (kneel && g.t - kneel.kneelAt > AI.finishWait && g.trust >= AI.finishTrust) return engage(ctx, kneel);
  if (foes.filter(e => cheb(e, me) <= 2).length >= 3 && me.dreadLeft > 0 && g.t >= me.dreadTo) return { skill: 'dread' };
  // Bane: ศัตรู ≥ 2 ตัวรุม York และยังไม่ติด Bane → หันไปยิงใส่กลุ่มนั้น
  const swarm = foes.filter(e => cheb(e, york) <= 1 && g.t >= e.baneTo);
  if (me.pactLeft > 0 && swarm.length >= 2) {
    const face = beamDir(g, me, me.x, me.y, swarm[0]);
    if (face) return { face, skill: 'bane' };
  }
  // องก์ 2: ศัตรูไม่ตี Atez จึงเดินไปดึงคันโยกโคมระย้าเองเมื่อศัตรูอยู่ใต้โคม ≥ 2 ตัว
  const lever = find(g.room, 'L').find(c => !g.rs.done[c.x + ',' + c.y]);
  const under = find(g.room, 'C');
  if (lever && foes.filter(e => under.some(c => c.x === e.x && c.y === e.y)).length >= 2 && g.cmd !== 'wait')
    return cheb(me, lever) === 1 ? { hold: true } : go(ctx, (x, y) => cheb({ x, y }, lever) === 1);
  const keep = (lo, hi) => (x, y) => { const n = cheb({ x, y }, york); return n >= lo && n <= hi; };
  if (!foes.length) return keep(2, 4)(me.x, me.y) ? {} : go(ctx, keep(2, 4));

  const b = g.boss && active(g.boss) ? g.boss : null;
  if (b?.suction && g.t >= me.dodgeAt) {   // แรงดูด: dodge สวนทาง ได้คืน 1 ช่องต่อครั้ง
    const away = [Math.sign(me.x - b.x - 0.5), Math.sign(me.y - b.y - 0.5)];
    return { dodge: true, dir: Math.abs(me.x - b.x) >= Math.abs(me.y - b.y) ? [away[0], 0] : [0, away[1]] };
  }
  const bossT = b && (g.enemies.find(e => e.kind === 'heart' && active(e))   // บอส: หัวใจ > ตุ่มหนอง (ต้องใช้ Atez) > ลูกน้ำใกล้ York > ตัวบอส
    || nearest(g.enemies.filter(e => e.kind === 'pustule' && active(e)), me)
    || g.enemies.find(e => e.kind === 'maggot' && active(e) && cheb(e, york) <= 3) || b);
  const t = (g.cmd === 'target' && g.cmdTarget) || bossT                // เป้า Vow ของ York ก่อน
    || (york.vow && g.t < york.vow.until && active(york.vow.target) && york.vow.target)
    || (g.ctrl === 0 && g.lastTarget && active(g.lastTarget) && g.lastTarget)
    || nearest(foes, york);
  const here = beamDir(g, me, me.x, me.y, t);
  if (here) return { face: here, attack: true };
  if (g.cmd === 'wait') return {};
  const kinNear = (x, y) => foes.some(e => e.s.family && cheb(e, { x, y }) <= 1);   // เลี่ยงการกอด
  const spot = (lo, hi) => (x, y) => keep(lo, hi)(x, y) && !kinNear(x, y) && beamDir(g, me, x, y, t);
  for (const [lo, hi] of [[3, 4], [2, 6]]) {                          // 1. รักษาระยะ 3–4 ช่องจาก York
    const s = go(ctx, spot(lo, hi));
    if (s.dir) return s;
  }
  return keep(2, 4)(me.x, me.y) ? {} : go(ctx, keep(2, 4));
}
