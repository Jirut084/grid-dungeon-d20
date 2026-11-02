// วาดเกมบน canvas 640×360 (GDD-MVP "หน้าจอต่อสู้") ด้วย asset ชั่วคราวจาก sprites.js
import { visual } from './sim.js';
import { charAt } from './room.js';
import { doorOpen } from './world.js';
import { pathTo } from './boss.js';
import { buildSprites, THEME } from './sprites.js';
import { loadAseprite, animFrame } from './aseprite.js';

export const TILE = 32, W = 640, H = 360;
let SPR;   // สร้างครั้งแรกที่วาด (ต้องมี document)

const PROPS = 'TpbhceLSr|KXD';
// สีช่องเตือนตาม GDD-MVP + ไอคอนมุมช่องคนละแบบ ให้คนตาบอดสีแยกได้
const WARN = { dmg: [230, 40, 40], ctrl: [160, 70, 230], heal: [60, 190, 80], disease: [170, 200, 40], spawn: [200, 200, 200] };
const ICON = {
  dmg: (c, x, y) => { c.beginPath(); c.moveTo(x + 3, y + 3); c.lineTo(x + 10, y + 3); c.lineTo(x + 3, y + 10); c.fill(); },
  ctrl: (c, x, y) => { c.beginPath(); c.arc(x + 7, y + 7, 3.5, 0, 7); c.stroke(); },
  heal: (c, x, y) => { c.fillRect(x + 6, y + 3, 2, 8); c.fillRect(x + 3, y + 6, 8, 2); },
  disease: (c, x, y) => { c.fillRect(x + 3, y + 3, 3, 3); c.fillRect(x + 8, y + 6, 3, 3); c.fillRect(x + 4, y + 9, 3, 3); },
  spawn: (c, x, y) => { c.beginPath(); c.arc(x + 7, y + 7, 3, 0, 7); c.fill(); },
};

const age = (g, f) => g.t - f.t;

// ภาพหน้าตรงของตัวละคร (ท่ายืนจาก Aseprite ถ้ามี) สำหรับ portrait ใน HUD หน้าเลือกฮีโร่ และกล่องบทพูด · t = วินาที
export function portrait(name, t = 0) {
  SPR ??= loadAseprite(buildSprites());
  return animFrame(name, 'idle_down', t) || animFrame(name, 'idle', t) || SPR[name];
}

export function draw(ctx, g) {
  SPR ??= loadAseprite(buildSprites());
  ctx.imageSmoothingEnabled = false;
  const me = g.heroes[g.ctrl], [mx, my] = visual(me, g.t);
  const cam = (pos, cells, view) => cells * TILE <= view
    ? (cells * TILE - view) / 2
    : Math.max(0, Math.min(cells * TILE - view, (pos + 0.5) * TILE - view / 2));
  const ox = Math.round(cam(mx, g.room.w, W)), oy = Math.round(cam(my, g.room.h, H));
  const X = x => Math.round(x * TILE - ox), Y = y => Math.round(y * TILE - oy);
  const box = (x, y, color, inset = 1) => { ctx.strokeStyle = color; ctx.strokeRect(X(x) + inset + 0.5, Y(y) + inset + 0.5, TILE - inset * 2 - 1, TILE - inset * 2 - 1); };
  const theme = THEME[g.roomId] ?? 'wood', wall = SPR[theme === 'stone' ? 'wall_stone' : 'wall_house'];

  ctx.fillStyle = '#0d0b10';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  // พื้น กำแพง และของในห้อง
  for (let y = 0; y < g.room.h; y++) for (let x = 0; x < g.room.w; x++) {
    const ch = charAt(g.room, x, y), px = X(x), py = Y(y), k = x + ',' + y, done = g.rs.done;
    if (ch === '#') { ctx.drawImage(wall, px, py); continue; }
    ctx.drawImage(SPR['floor_' + theme][(x * 7 + y * 3) % 4], px, py);
    if (ch === 'C') { ctx.fillStyle = 'rgba(232,200,80,0.35)'; ctx.fillRect(px + 13, py + 13, 6, 6); }   // จุดโคมระย้าตก
    if (!PROPS.includes(ch)) {
      if ('?E'.includes(ch)) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillText(ch, px + TILE / 2, py + TILE / 2); }   // ช่องเกิดศัตรู
      continue;
    }
    let spr = SPR[ch];
    if (ch === 'S' && g.boss) {   // แผ่นผนึก: สว่าง = ทอง · แตก (เฟส 2) = มืด
      const i = g.boss.plates.findIndex(q => q.x === x && q.y === y);
      spr = i < 0 ? SPR.sealBroken : i === g.boss.lit && g.boss.hp > 0 ? SPR.sealLit : SPR.S;
    }
    ctx.globalAlpha = 'ceLr'.includes(ch) && done[k] ? 0.4 : 1;   // ใช้แล้ว = จาง
    ctx.drawImage(spr, px, py);
    ctx.globalAlpha = 1;
    if (ch === 'D') { ctx.fillStyle = doorOpen(g, x, y) ? '#5ce05c' : '#e04848'; ctx.fillRect(px + 13, py + 3, 6, 4); }   // ไฟเขียว = ไปได้ · แดง = ล็อก
    if ((ch === 'K' || ch === 'X') && done[k + 'pray']) box(x, y, '#ffcc33', 2);                       // สวดแล้ว
    if (ch === 'X' && done[k + 'speak']) { ctx.fillStyle = '#fff'; ctx.fillRect(px + 24, py + 5, 3, 3); }
  }

  // หมอกโรคค้างพื้น / ไฟจากเตา
  for (const z of g.zones) for (const [x, y] of z.cells) {
    ctx.fillStyle = z.fire ? 'rgba(255,120,30,0.45)' : 'rgba(170,200,40,0.3)';
    ctx.fillRect(X(x), Y(y), TILE, TILE);
    ctx.fillStyle = z.fire ? 'rgba(255,220,120,0.9)' : 'rgba(220,240,120,0.8)';
    ICON.disease(ctx, X(x) + 16, Y(y) + 16);
  }

  // ช่องเตือน: เติมสี 4 ขั้นตามเวลาที่เหลือ + ไอคอนมุมช่อง
  for (const w of g.danger) {
    const [r, gr, b] = WARN[w.color];
    const stage = Math.min(3, Math.floor(((g.t - w.start) / (w.at - w.start)) * 4));
    for (const [x, y] of w.cells) {
      ctx.fillStyle = `rgba(${r},${gr},${b},${0.2 + stage * 0.14})`;
      ctx.fillRect(X(x) + 1, Y(y) + 1, TILE - 2, TILE - 2);
      box(x, y, `rgb(${r},${gr},${b})`);
      ctx.fillStyle = ctx.strokeStyle = '#fff';
      ICON[w.color](ctx, X(x), Y(y));
    }
  }
  const atez = g.heroes[1];
  if (g.boss?.suction && !atez.swallowed) for (const [x, y] of pathTo(g.boss, atez)) {   // แรงดูดกำลังทำงาน
    ctx.fillStyle = 'rgba(160,70,230,0.55)'; ctx.fillRect(X(x) + 8, Y(y) + 8, TILE - 16, TILE - 16);
  }
  for (const f of g.fx) if (f.kind === 'strike' && age(g, f) < 0.12) {
    const [r, gr, b] = WARN[f.color];
    for (const [x, y] of f.cells) { ctx.fillStyle = `rgba(${r},${gr},${b},0.85)`; ctx.fillRect(X(x), Y(y), TILE, TILE); }
  }

  // ตัวละคร: วาดจากแถวบนลงล่าง ให้ตัวที่อยู่หน้าบังตัวที่อยู่หลัง
  for (const f of g.fx) if (f.kind === 'dodge' && age(g, f) < 0.25) {
    ctx.fillStyle = `rgba(200,220,255,${0.5 - age(g, f) * 2})`;
    ctx.fillRect(X(f.x) + 5, Y(f.y) + 5, TILE - 10, TILE - 10);
  }
  const york = g.heroes[0];
  const bodies = [...g.enemies.filter(e => e.hp > 0 || e.kneel), ...g.heroes.filter(h => !h.swallowed)]
    .sort((a, b) => visual(a, g.t)[1] - visual(b, g.t)[1]);
  for (const e of bodies) {
    const [vx, vy] = visual(e, g.t), px = X(vx), py = Y(vy);
    if (e.kind === 'boss') { drawBoss(ctx, g, e, px, py, atez); continue; }
    const blink = g.t - e.hitAt < 0.1, ghost = e.side === 'hero' && g.t < e.iframeTo;
    const name = e.kind === 'atez' && g.t < e.dreadTo ? 'dread' : e.kind;
    const moving = g.t < e.t1, dir = e.face[0] ? 'side' : e.face[1] < 0 ? 'up' : 'down';
    const tag = t => animFrame(name, t + '_' + dir, g.t) || animFrame(name, t, g.t);   // tag ตามทิศ หรือไม่แยกทิศ (ลูกน้ำ)
    // ท่าจาก tag ใน Aseprite ตามลำดับความสำคัญ · tag ไหนยังไม่วาดก็ข้ามไปท่าถัดไป
    const struck = e.side === 'hero' && e.s.attack && g.t < e.atkAt - e.s.attack.cd + 0.2;
    const act = [e.down && 'down', e.kneel && 'kneel', blink && 'hit', e.side === 'hero' && g.t < e.iframeTo && 'dodge',
      (struck || e.windup) && 'attack', moving && 'walk', 'idle'].filter(Boolean).find(tag);
    const anim = act && tag(act);
    const spr = blink && act !== 'hit' && SPR[name + 'Flash'] ? SPR[name + 'Flash'] : anim ?? SPR[name];
    const bob = anim || moving || e.down || e.kneel ? 0 : Math.round(Math.sin(g.t * 3 + e.x * 1.7) * 0.6 + 0.4);
    // เงาใต้เท้า · ตัวที่ผู้เล่นคุม = เงาเหลือง
    ctx.fillStyle = e === me ? 'rgba(255,226,138,0.55)' : 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(px + 16, py + 29, 10, 3, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.globalAlpha = ghost ? 0.45 : 1;
    ctx.translate(px + 16, py + 32);   // sprite 32×32 พอดีช่อง
    if (e.down && act !== 'down') { ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.7; }   // ล้ม: นอนลง (ยังไม่มีท่า down)
    if (e.kneel && act !== 'kneel') ctx.scale(1, 0.7);                                   // elite คุกเข่า (ยังไม่มีท่า kneel)
    if (e.face[0] < 0) ctx.scale(-1, 1);                              // หันซ้าย = กลับภาพ
    if (e.hugger) ctx.translate(Math.sin(g.t * 30), 0);               // ถูกกอด: สั่น
    ctx.drawImage(spr, -spr.width / 2, -spr.height - bob);
    ctx.restore();
    // ลูกศรเล็กบอกทิศที่หัน เฉพาะตัวที่ยังไม่มีท่าแยกทิศจาก Aseprite
    if (!animFrame(name, 'idle_' + dir, g.t)) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(px + 15 + e.face[0] * 12, py + 28 + e.face[1] * 3, 2, 2);
    }
    const top = py + 32 - spr.height;   // หัวของ sprite
    if (g.t < e.parryTo) { ctx.fillStyle = '#fff'; ctx.fillRect(px + 13 + e.face[0] * 13 - Math.abs(e.face[1]) * 9, py + 13 + e.face[1] * 13 - Math.abs(e.face[0]) * 9, e.face[0] ? 4 : 24, e.face[1] ? 4 : 24); }
    if (g.t < e.stunTo || g.t < e.fearTo) { ctx.fillStyle = g.t < e.stunTo ? '#ffd84a' : '#7fd0ff'; ctx.fillText(g.t < e.stunTo ? '**' : '!?', px + TILE / 2, top - 4); }
    if (g.t < e.poisonTo) { ctx.fillStyle = '#7ccf3a'; ctx.fillRect(px + 25, py + 25, 4, 4); }
    if (g.t < (e.charmTo ?? 0)) { ctx.fillStyle = '#ff8fc8'; ctx.fillText('♥', px + TILE / 2, top - 4); }
    if (g.t < (e.baneTo ?? 0)) { ctx.fillStyle = '#9a7ad8'; ctx.fillRect(px + 3, py + 25, 4, 4); }   // ติด Bane
    if (e.kneel) { ctx.fillStyle = '#ffe28a'; ctx.fillText('!', px + TILE / 2, top - 2); }              // รอให้ปิด
    if (e.hugger) { box(vx, vy, '#b070ff', 1); box(vx, vy, '#b070ff', 2); }
    if (e.stacks) for (let i = 0; i < e.stacks; i++) { ctx.fillStyle = '#b070ff'; ctx.fillRect(px + 4 + i * 5, top - 4, 3, 3); }
    if (e.down) for (let i = 0; i < 3; i++) {   // death save: เขียวสำเร็จ แดงล้มเหลว
      ctx.fillStyle = i < e.down.ok ? '#5c5' : '#333'; ctx.fillRect(px + 4 + i * 5, py - 4, 4, 3);
      ctx.fillStyle = i < e.down.fail ? '#e44' : '#333'; ctx.fillRect(px + 18 + i * 5, py - 4, 4, 3);
    }
    if (e.hold) {
      const k = (g.t - e.hold.start) / (e.hold.until - e.hold.start);
      ctx.fillStyle = '#000'; ctx.fillRect(px + 4, top - 6, TILE - 8, 3);
      ctx.fillStyle = '#fff'; ctx.fillRect(px + 4, top - 6, Math.round((TILE - 8) * k), 3);
    }
    if (e.side === 'enemy' && e.hp < e.maxHp && !e.kneel) {
      ctx.fillStyle = '#000'; ctx.fillRect(px + 4, top - 4, TILE - 8, 3);
      ctx.fillStyle = '#e04848'; ctx.fillRect(px + 4, top - 4, Math.round((TILE - 8) * e.hp / e.maxHp), 3);
    }
    if (york.vow?.target === e && g.t < york.vow.until) box(vx, vy, '#ffcc33', 0);   // เป้า Vow
    if (g.cmdTarget === e) {                                                        // เป้าที่สั่งคู่หู
      ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(px + 16, top - 8); ctx.lineTo(px + 16, top - 2); ctx.stroke();
    }
  }

  // เอฟเฟกต์ (ไม่มีตัวเลขดาเมจลอย ตาม GDD-MVP — มีแค่ d20 ทองตอนคริต)
  for (const f of g.fx) {
    const a = age(g, f), cx = x => X(x) + TILE / 2, cy = y => Y(y) + TILE / 2;
    if (f.kind === 'weapon' && a < 0.1) {
      for (const [x, y] of f.cells) { ctx.fillStyle = 'rgba(150,210,255,0.35)'; ctx.fillRect(X(x) + 4, Y(y) + 4, TILE - 8, TILE - 8); }
    } else if (f.kind === 'swing' && a < 0.1) {
      ctx.lineWidth = 2; box(f.x, f.y, '#fff', 2); ctx.lineWidth = 1;
    } else if (f.kind === 'beam' && a < 0.12) {
      ctx.strokeStyle = f.dread ? '#ff4a6a' : '#b48cff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx(f.x), cy(f.y)); ctx.lineTo(cx(f.x2), cy(f.y2)); ctx.stroke(); ctx.lineWidth = 1;
    } else if (f.kind === 'dust' && a < 0.4) {
      ctx.fillStyle = `rgba(190,180,160,${1 - a / 0.4})`;
      for (let i = 0; i < 4; i++) ctx.fillRect(X(f.x) + 6 + i * 6, Y(f.y) + 20 - a * 30 - (i % 2) * 6, 3, 3);
    } else if (f.kind === 'save' && a < 1) {   // death save: d20 ที่เห็นบนจอ เขียวผ่าน แดงพลาด
      ctx.fillStyle = '#1a1206'; ctx.fillRect(cx(f.x) - 10, Y(f.y) - 22, 20, 12);
      ctx.fillStyle = f.ok ? '#7ccf3a' : '#e06050'; ctx.fillText(String(f.r), cx(f.x), Y(f.y) - 16);
    } else if (f.kind === 'bane' && a < 0.4) {
      ctx.strokeStyle = '#9a7ad8'; ctx.lineWidth = 2;
      ctx.strokeRect(X(f.x) - TILE + 2, Y(f.y) - TILE + 2, TILE * 3 - 4, TILE * 3 - 4); ctx.lineWidth = 1;
    } else if (f.kind === 'crit' && a < 0.6) {
      ctx.fillStyle = '#1a1206'; ctx.fillRect(cx(f.x) - 9, Y(f.y) - 22 - a * 12, 18, 12);
      ctx.fillStyle = '#ffcc33'; ctx.fillText('20', cx(f.x), Y(f.y) - 16 - a * 12);
    } else if ((f.kind === 'shield' || f.kind === 'heal' || f.kind === 'block') && a < 0.3) {
      ctx.lineWidth = 2;
      box(f.x, f.y, { shield: '#b070ff', heal: '#5c5', block: '#fff' }[f.kind], 1 - Math.round(a * 10));
      ctx.lineWidth = 1;
    }
  }
}

// ก้อนเนื้อโสมม 2×2: กะพริบตอนโดนตี · Exposed = เหลือง · ช่วงท้าย = แดงเข้ม · เฟส 2 = น้ำตาล · Slowed = ขอบฟ้า · กลืน Atez = ขอบม่วง
function drawBoss(ctx, g, e, px, py, atez) {
  const anim = (g.t < e.t1 && animFrame('boss', 'walk', g.t)) || animFrame('boss', 'idle', g.t);   // คลาน (เฟส 2) / ดึ๋งดั๋ง
  const pulse = anim ? 0 : Math.round(Math.sin(g.t * 4) * 1.5);
  ctx.drawImage(g.t - e.hitAt < 0.08 ? SPR.bossFlash : anim ?? SPR.boss, px, py - pulse, TILE * 2, TILE * 2 + pulse);
  const tint = g.t < e.exposedTo ? 'rgba(240,230,110,0.35)' : e.finaleTo ? 'rgba(140,20,40,0.35)' : e.phase === 2 ? 'rgba(120,80,30,0.3)' : null;
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(px + 4, py + 4, TILE * 2 - 8, TILE * 2 - 8); }
  if (g.t < e.slowTo) { ctx.lineWidth = 2; ctx.strokeStyle = '#7fd0ff'; ctx.strokeRect(px + 2, py + 2, TILE * 2 - 4, TILE * 2 - 4); ctx.lineWidth = 1; }
  if (atez.swallowed) { ctx.lineWidth = 3; ctx.strokeStyle = '#b070ff'; ctx.strokeRect(px + 6, py + 6, TILE * 2 - 12, TILE * 2 - 12); ctx.lineWidth = 1; }
}
