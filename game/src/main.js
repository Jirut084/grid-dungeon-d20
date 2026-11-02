// ฝั่งเบราว์เซอร์: โหลดห้อง รับปุ่ม วนเกม 60 ครั้ง/วินาที วาด HUD หน้าต่างเลือก และ Journal
import { parseRoom } from './room.js';
import { createGame, step } from './sim.js';
import { draw, portrait } from './render.js';
import { retell, enterRoom, interactable, runSummary } from './world.js';
import { LEVELS, ATTUNE, ENDINGS, TARGETS, BOSS } from './data.js';
import { hasFeat, hasRelic } from './gear.js';
import { active } from './grid.js';
import { loadSounds, unlock, sfx, music, toggleMute } from './audio.js';

const ROOMS = ['R0', 'R1', 'R2a', 'R2b', 'R3', 'R4', 'R5', 'R6'];
const DT = 1 / 60, BUFFER = 0.15, SPIN = 800;
const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0],
};
const SKILL_KEYS = {
  KeyU: { york: 'vow', atez: 'dread' }, KeyI: { york: 'smite', atez: 'bell' }, KeyO: { york: 'grab', atez: 'bane' }, KeyP: { york: 'dash' },
  KeyF: { york: 'stone' },
};
const CMD_KEYS = { Digit1: 'follow', Digit2: 'wait', Digit3: 'target' };
const $ = s => document.querySelector(s);
const ctx = $('#view').getContext('2d');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ข้อความทุกบรรทัดมาจาก strings.json (GDD หมวด 11) · ชื่อของมี "ชื่อ|คำอธิบาย"
const strings = await (await fetch('strings.json')).json();
let lang = 'th';
try { lang = localStorage.getItem('lang') || 'th'; } catch {}
const tr = (key, vars = {}) => (strings[key]?.[lang] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const nameOf = key => tr(key).split('|')[0];
const descOf = key => tr(key).split('|')[1] ?? '';
const sign = n => (n >= 0 ? '+' : '') + n;

const rooms = Object.fromEntries(await Promise.all(ROOMS.map(async id =>
  [id, parseRoom(await (await fetch(`../tools/rooms/${id}.txt`)).text())])));   // ไฟล์เดียวกับที่ผู้ออกแบบแก้

// กดสั้นกว่า 1 เฟรมก็ไม่หาย: เก็บการกดไว้ 0.15 วิ (สั้นกว่าเวลาเดิน 1 ช่อง จึงไม่เดินเบิ้ล)
let g, held = [], tapDir, tapAt = -1, attack = false, attackAt = -1, dodgeAt = -1, hold = false, pulse = {};
let journal = null, logSeen = 0, saved = false, runId, runAt;
let rate = null, rateOn = false;   // ให้คะแนนอารมณ์หลังเคลียร์ห้อง (GDD-MVP "การทดสอบ") · { r, vals }
await loadSounds();
try { rateOn = localStorage.getItem('rate') === '1'; } catch {}
const toast = text => { $('#toast').textContent = text; $('#toast').dataset.at = g.t; };
const pick = i => { pulse.choose = i; sfx('card'); };
const store = {   // Relic ฉากจบ (ติดตัวไป run ถัดไป) และ log ตัววัดของทุก run เก็บในเบราว์เซอร์เครื่องนี้
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function newRun() {
  g = createGame(rooms, { seed: (Math.random() * 2 ** 31) | 0, select: true, legacy: store.get('legacy', []) });
  saved = false;
  runId = Date.now().toString(36); runAt = new Date().toISOString();
  tapAt = attackAt = dodgeAt = -1;
  pulse = {};
  logSeen = 0;
  lastTrust = null;
}

addEventListener('pointerdown', () => unlock());
addEventListener('keydown', ev => {
  const c = ev.code;
  unlock();   // เบราว์เซอร์ให้เริ่มเสียงหลังผู้เล่นกดปุ่มแรก
  if (rate) {   // หน้าให้คะแนน: 1–5 ทีละข้อ แล้วพิมพ์ 1 บรรทัด Enter บันทึก · Esc ข้าม
    if (c === 'Escape') rate = null;
    else if (c === 'Enter' && rate.vals.length === 3) {
      const [tension, bond, annoy] = rate.vals;
      rate.r.feel = { tension, bond, annoy, note: $('#rate input')?.value ?? '' };
      rate = null;
      saveRun();
    } else if (ev.target.tagName === 'INPUT') return;   // กำลังพิมพ์บันทึก
    else if (/^Digit[1-5]$/.test(c) && rate.vals.length < 3) { rate.vals.push(+c.slice(5)); sfx('card'); }
    else return;
    return ev.preventDefault();
  }
  if (journal) {   // Journal เปิดอยู่: หยุดเกม
    if (c === 'KeyQ' || c === 'Escape') journal = null;
    else if (c === 'ArrowLeft' || c === 'ArrowRight') journal.tab = (journal.tab + (c === 'ArrowLeft' ? 2 : 1)) % 3;
    else return;
    return ev.preventDefault();
  }
  if (g.state === 'over' && !g.modal && c !== 'KeyL') {   // หน้าจบ run
    if (c === 'KeyN') newRun(); else if (c === 'KeyD') download();
    return ev.preventDefault();
  }
  if (g.modal) {   // หน้าต่างเลือก: ตัวเลขเลือก · Enter/Space/J = ตัวเลือกแรก (ถ้ามีตัวเดียว)
    // Shift+เลข = วาร์ป ไม่ใช่เลือก
    const n = /^Digit[1-9]$/.test(c) && !ev.shiftKey ? +c.slice(5) - 1 : ['Enter', 'Space', 'KeyJ'].includes(c) && g.modal.options.length === 1 ? 0 : null;
    if (n != null && g.modal.kind === 'scene' && !typingDone()) typing.start = -1e9;   // ขึ้นเต็มบรรทัดก่อน
    else if (n != null && !spinning()) pick(n);
    if (c !== 'KeyL') return ev.preventDefault();
  }
  if (KEYS[c]) { if (!held.includes(c)) held.push(c); tapDir = KEYS[c]; tapAt = g.t; }
  else if (c === 'KeyJ' || c === 'KeyZ') { attack = true; attackAt = g.t; }
  else if (c === 'KeyK' || c === 'KeyX' || c === 'Space') { if (!ev.repeat) dodgeAt = g.t; }
  else if (c === 'KeyE') hold = true;
  else if (SKILL_KEYS[c]) { if (!ev.repeat) pulse.skill = SKILL_KEYS[c][g.heroes[g.ctrl].kind]; }
  else if (ev.shiftKey && /^Digit[1-8]$/.test(c)) enterRoom(g, ROOMS[c.slice(5) - 1]);   // วาร์ปห้อง (ทดสอบ)
  else if (CMD_KEYS[c]) pulse.cmd = CMD_KEYS[c];
  else if (c === 'KeyQ') { journal = { tab: 0 }; sfx('page'); }
  else if (c === 'KeyM') toast(tr(toggleMute() ? 'msg.muteOn' : 'msg.muteOff'));
  else if (c === 'KeyT') {
    rateOn = !rateOn;
    try { localStorage.setItem('rate', rateOn ? '1' : '0'); } catch {}
    toast(tr(rateOn ? 'msg.rateOn' : 'msg.rateOff'));
  }
  else if (c === 'KeyR') retell(g);
  else if (c === 'KeyN') newRun();
  else if (c === 'KeyL') {
    lang = lang === 'th' ? 'en' : 'th';
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch {}
  }
  else return;
  ev.preventDefault();
});
addEventListener('keyup', ev => {
  held = held.filter(c => c !== ev.code);
  if (ev.code === 'KeyJ' || ev.code === 'KeyZ') attack = false;
  if (ev.code === 'KeyE') hold = false;
});
addEventListener('blur', () => { held = []; attack = hold = false; });

function fit() {
  const k = Math.min(innerWidth / 640, innerHeight / 360);
  $('#stage').style.setProperty('--scale', k >= 1 ? Math.floor(k) : k);
}
addEventListener('resize', fit);
fit();

// ---------- หน้าต่างเลือก (modal) ----------
let shown = null, shownAt = 0, shownLang;
const spinning = () => ['roll', 'contest', 'deathsave'].includes(g.modal?.kind) && performance.now() - shownAt < SPIN;
// บทพูดขึ้นทีละคำ (ตัดคำไทยด้วย Intl.Segmenter) · กดครั้งแรกให้ขึ้นเต็ม กดอีกครั้งไปต่อ
const WORDS_PER_SEC = 14;
const words = text => (Intl.Segmenter ? [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(text)].map(s => s.segment) : [...text]);
let typing = null;   // { text, parts, start }
const typingDone = () => !typing || (performance.now() - typing.start) / 1000 * WORDS_PER_SEC >= typing.parts.length;

// canvas ที่วาดท่ายืนของตัวละครใหม่ทุกเฟรม (ขยับตาม animation) · ใช้ใน HUD หน้าเลือกฮีโร่ และกล่องบทพูด
const sprite = (name, cls = 'pt') => { const c = el('canvas', cls); c.width = c.height = 32; c.dataset.sprite = name; return c; };
function paintSprites() {
  const t = performance.now() / 1000;
  for (const c of document.querySelectorAll('canvas[data-sprite]')) {
    const img = portrait(c.dataset.sprite, t), x = c.getContext('2d');
    x.clearRect(0, 0, 32, 32);
    if (img) x.drawImage(img, (32 - img.width) / 2, 32 - img.height);
  }
}

function modalView(m) {
  const me = g.heroes[g.ctrl].kind;
  const v = { title: '', body: [], opts: m.options.map(() => ({ label: tr('ok') })) };
  if (m.kind === 'hero') {   // โต๊ะ DM: ฮีโร่ 2 ตัวรอเลือก อีก 2 เป็นเงามืด "ยังไม่เข้าร่วมเซสชันนี้"
    v.title = tr('hero.title');
    v.heroes = m.options.map(o => ({ sprite: o.hero, label: tr('hero.pick', { name: tr('hero.' + o.hero) }), info: tr(`hero.${o.hero}.info`), ai: tr(`hero.${o.hero}.ai`) }));
  } else if (m.kind === 'check') {
    v.title = tr('check.' + m.check);
    v.body = [tr('check.pick')];
    v.opts = m.options.map(o => ({
      label: tr('check.option', { hero: tr('hero.' + o.hero), skill: tr('skill.' + o.skill), dc: o.dc, pct: Math.round(o.chance * 100) }),
      desc: tr('check.bonus', { sheet: sign(o.bonus), bless: o.bless ? tr('check.bless', { n: o.bless }) : '' }),
    }));
  } else if (m.kind === 'roll') {
    v.title = tr('check.' + m.check);
    v.die = true;
    v.body = [tr('roll.line', { r: m.r, bonus: sign(m.opt.bonus + m.opt.bless), total: m.total, dc: m.opt.dc }),
      m.r === 20 ? tr('roll.nat20') : m.r === 1 ? tr('roll.nat1') : tr(m.ok ? 'roll.ok' : 'roll.fail')];
    v.opts = m.options.map(o => ({ label: o.reroll ? tr('roll.reroll', { n: g.luck }) : tr('ok') }));
  } else if (m.kind === 'levelup') {
    v.title = tr('levelup.title');
    v.cards = m.options.map(c => {
      const k = c.type === 'evo' ? 'weapon.' + c.to : c.type === 'heal' ? null : `${c.type === 'relic' ? 'relic' : c.type}.${c.id}`;
      return { type: tr('card.' + c.type), name: k ? nameOf(k) : tr('card.heal'), desc: k ? descOf(k) : tr('card.heal.desc'),
        lv: c.lvl ? tr('card.lv', { n: c.lvl }) : '' };
    });
  } else if (m.kind === 'speak') {
    v.title = tr('speak.title', { n: m.idx });
    if (m.truth) {
      v.body = [tr('swd.heard', { line: tr(m.truth) })];
      v.opts = m.options.map(o => ({ label: tr('speak.' + o.tell) }));
    } else v.body = [tr('swd.channeling'), tr('swd.atezSays', { line: tr(m.heard) })];
  } else if (m.kind === 'loot') {
    v.title = tr('loot.title');
    v.body = [nameOf('relic.' + m.relic), descOf('relic.' + m.relic), m.legacy ? tr('loot.legacy') : tr('loot.to', { hero: tr('hero.' + m.hero) })];
  } else if (m.kind === 'scene') {   // กล่องบทพูด: ชื่อผู้พูดสีประจำตัว · DM ตัวเอียงไม่มีชื่อ
    const [who, key] = m.lines[m.i];
    v.title = tr(m.title);
    v.speaker = who === 'dm' ? null : { who, name: tr('hero.' + who), side: who === me ? 'left' : 'right' };
    v.body = [tr(key)];
    v.dm = who === 'dm';
    v.opts = [{ label: tr('scene.next') }];
    v.progress = `${m.i + 1}/${m.lines.length}`;
  } else if (m.kind === 'confront') {
    v.title = tr('confront.title');
    v.opts = m.options.map(o => ({ label: tr('confront.' + o.pick) }));
  } else if (m.kind === 'forgive') {
    v.title = tr('forgive.title');
    v.opts = m.options.map(o => ({ label: tr('forgive.' + o.end) }));
  } else if (m.kind === 'contest') {
    v.title = tr('contest.title');
    v.dice = [m.a, m.y];
    v.body = [tr('contest.atez', { r: m.a, b: m.deception, total: m.a + m.deception }),
      tr('contest.york', { r: m.y, b: m.insight, total: m.y + m.insight }), tr(m.win ? 'contest.win' : 'contest.lose')];
    v.opts = m.options.map(o => ({ label: o.reroll ? tr('roll.reroll', { n: g.luck }) : tr('ok') }));
  } else if (m.kind === 'drop') {
    v.title = tr('drop.title', { hero: tr('hero.' + m.hero), relic: nameOf('relic.' + m.relic) });
    v.opts = m.options.map(o => (o.drop ? { label: nameOf('relic.' + o.drop), desc: descOf('relic.' + o.drop) }
      : { label: tr('drop.skip', { relic: nameOf('relic.' + m.relic) }) }));
  } else if (m.kind === 'pair') {
    v.title = tr('pair.title');
    v.opts = m.options.map(o => ({ label: `${nameOf('weapon.' + o.pair[0])} + ${nameOf('passive.' + o.pair[1])}`,
      desc: `${descOf('weapon.' + o.pair[0])}\n${descOf('passive.' + o.pair[1])}` }));
  } else if (m.kind === 'medicine') {
    v.title = tr('medicine.title');
    v.opts = [{ label: nameOf('relic.gauntlets'), desc: descOf('relic.gauntlets') }, { label: tr('medicine.potion') }];
  } else if (m.kind === 'censer') {
    v.title = tr('censer.title');
    v.body = [descOf('relic.censer')];
    v.opts = [{ label: tr('censer.take') }, { label: tr('censer.leave') }];
  } else if (m.kind === 'rest') {
    v.title = tr('rest.title');
    v.body = [tr('rest.body'), tr('rest.memory')];
    v.dm = true;
    v.opts = m.options.map(o => ({ label: tr(o.swap ? 'rest.swap' : 'ok') }));
  } else if (m.kind === 'swap') {
    v.title = tr('swap.title');
    v.opts = m.options.map(o => (o.relic ? { label: nameOf('relic.' + o.relic), desc: descOf('relic.' + o.relic) } : { label: tr('swap.none') }));
  } else if (m.kind === 'deathsave') {
    v.title = tr('save.title', { hero: tr('hero.' + m.hero) });
    v.die = true;
    v.body = [tr('roll.fail')];
    v.opts = [{ label: tr('roll.reroll', { n: g.luck }) }, { label: tr('save.accept') }];
  }
  v.me = me;
  return v;
}

function modal() {
  const m = g.modal, box = $('#modal');
  box.hidden = !m;
  if (!m) { shown = null; return; }
  if (m !== shown) shownAt = performance.now();
  const spin = spinning();
  if (m !== shown || lang !== shownLang || box.dataset.spin !== String(spin)) {
    shown = m; shownLang = lang; box.dataset.spin = spin;
    const v = modalView(m), inner = el('div', 'box' + (v.dm ? ' dm' : ''));
    inner.append(el('h2', null, v.title));
    if (v.speaker) inner.append(el('b', 'speaker ' + v.speaker.who, v.speaker.name));
    if (v.heroes) {
      const row = el('div', 'heroes');
      v.heroes.forEach((h, i) => {
        const card = el('button', 'hero');
        card.append(sprite(h.sprite), el('b', null, `${i + 1}. ${h.label}`), el('small', null, h.info), el('small', 'ai', h.ai));
        card.onclick = () => pick(i);
        row.append(card);
      });
      for (let i = 0; i < 2; i++) { const s = el('div', 'hero shadow'); s.append(el('div', 'silhouette'), el('small', null, tr('hero.absent'))); row.append(s); }
      inner.append(row);
    }
    if (v.die) inner.append(el('div', 'die' + (m.r === 20 && !spin ? ' gold' : m.r === 1 && !spin ? ' crack' : ''), spin ? '' : m.r));
    if (v.dice) {
      const row = el('div', 'dice');
      v.dice.forEach(n => row.append(el('div', 'die' + (n === 20 && !spin ? ' gold' : n === 1 && !spin ? ' crack' : ''), spin ? '' : n)));
      inner.append(row);
    }
    if (m.kind === 'scene') { typing = { text: v.body[0], parts: words(v.body[0]), start: performance.now() }; inner.append(el('p', 'typed', '')); }
    else if (!spin) v.body.forEach((line, i) => inner.append(el('p', i === v.body.length - 1 && v.dm ? 'memory' : null, line)));
    if (v.cards) {
      const row = el('div', 'cards');
      v.cards.forEach((c, i) => {
        const card = el('button', 'card');
        card.append(el('small', null, `${i + 1} · ${c.type} ${c.lv}`), el('b', null, c.name), el('span', null, c.desc));
        card.onclick = () => pick(i);
        row.append(card);
      });
      inner.append(row);
    } else if (!spin && !v.heroes) {
      const opts = el('div', 'opts');
      v.opts.forEach((o, i) => {
        const b = el('button', null, `${i + 1}. ${o.label}`);
        if (o.desc) b.append(el('small', null, o.desc));
        b.onclick = () => pick(i);
        opts.append(b);
      });
      inner.append(opts);
    }
    if (v.progress) inner.append(el('small', 'progress', v.progress));
    // portrait ข้างกล่องบทพูด: ฝั่งเราซ้าย อีกฝ่ายขวา (DM ไม่มี portrait)
    const pt = v.speaker && sprite(v.speaker.who, 'portrait ' + v.speaker.side);
    box.replaceChildren(...(pt ? (v.speaker.side === 'left' ? [pt, inner] : [inner, pt]) : [inner]));
  }
  if (spin) for (const d of box.querySelectorAll('.die')) d.textContent = 1 + Math.floor(Math.random() * 20);   // d20 หมุน 0.8 วิ
  if (m.kind === 'scene' && typing) {
    const n = Math.min(typing.parts.length, Math.floor((performance.now() - typing.start) / 1000 * WORDS_PER_SEC));
    if (n > (typing.n ?? 0)) sfx('type');
    typing.n = n;
    box.querySelector('.typed').textContent = typing.parts.slice(0, n).join('');
  }
}

// ---------- Journal ----------
function journalView() {
  const box = $('#journal');
  box.hidden = !journal;
  if (!journal) return;
  const tabs = ['journal.duo', 'hero.york', 'hero.atez'], page = el('div', 'page');
  const head = el('div', 'tabs');
  tabs.forEach((k, i) => head.append(el('span', i === journal.tab ? 'on' : null, tr(k))));
  page.append(head);
  if (journal.tab === 0) {
    page.append(el('h2', null, tr('journal.duo')), el('p', null, tr('journal.prayed', { n: g.prayed })), el('p', null, tr('journal.spoken', { n: g.spoken })));
    for (const c of g.journal.corpses) {
      // เล่นเป็น York: เห็นเฉพาะที่ Atez เล่า (คำโกหกก็บันทึกเป็นคำโกหก)
      const line = g.ctrl === 1 || c.told === 'tell' ? tr(c.truth) : tr('swd.silent');
      page.append(el('p', 'entry', tr('journal.corpse', { n: c.idx, line }) + (g.ctrl === 1 ? ' ' + tr('journal.told.' + c.told) : '')));
    }
    if (g.journal.notes.includes('ledger')) page.append(el('p', 'entry', tr('journal.ledger')));
    if (g.journal.notes.includes('gmPage')) page.append(el('p', 'entry', tr('journal.gmPage')));
  } else {
    page.append(el('h2', null, tr(tabs[journal.tab])));
    for (let n = 1; n <= 8; n++) page.append(el('p', 'faded', `${tr('journal.chapter', { n })} · ${tr('journal.faded')}`));
  }
  page.append(el('small', 'help', tr('journal.help')));
  box.replaceChildren(page);
}

// ---------- HUD ----------
const SKILLS = {
  york: h => [
    { key: 'J', label: 'hud.attack', cd: [h.atkAt, h.s.attack.cd] },
    { key: 'K', label: 'hud.dodge', cd: [h.dodgeAt, h.s.dodge.cd] },
    { key: 'U', label: 'hud.vow', count: h.chan, on: h.vow && g.t < h.vow.until,
      cd: h.chan < h.s.channel.max ? [h.chanAt, h.s.channel.regen] : null },
    { key: 'I', label: 'hud.smite', count: h.smiteLeft, on: h.smiteArmed },
    { key: 'O', label: 'hud.grab', cd: [h.grabAt, h.s.grab.cd] },
    { key: 'E', label: 'hud.lay', count: h.layPool },
    { key: 'F', label: 'hud.stone', cd: [h.stoneAt, h.s.stone.cd] },
    ...(hasFeat(h, 'forgetPlan') ? [{ key: 'P', label: 'hud.dash', cd: [h.dashAt, 8] }] : []),
  ],
  atez: h => [
    { key: 'J', label: 'hud.attack', cd: [h.atkAt, h.s.attack.cd] },
    { key: 'K', label: 'hud.dodge', cd: [h.dodgeAt, h.s.dodge.cd] },
    { key: 'U', label: 'hud.dread', count: h.dreadLeft, on: g.t < h.dreadTo },
    { key: 'O', label: 'hud.bane', count: h.pactLeft },
    ...(hasRelic(h, 'bell') ? [{ key: 'I', label: 'hud.bell', count: g.bellUsed ? 0 : 1 }] : []),
  ],
};
let skillsFor;

function skills(me) {
  const list = SKILLS[me.kind](me), box = $('#skills'), sig = me.kind + list.length;
  if (skillsFor !== sig) {
    skillsFor = sig;
    box.innerHTML = list.map(s => `<div class="skill"><kbd>${s.key}</kbd><span></span><em></em></div>`).join('');
  }
  list.forEach((s, i) => {
    const e = box.children[i];
    e.querySelector('span').textContent = tr(s.label);
    e.querySelector('em').textContent = s.count ?? '';
    e.classList.toggle('on', !!s.on);
    e.style.setProperty('--cd', s.cd ? Math.max(0, s.cd[0] - g.t) / s.cd[1] : 0);
  });
}

function unit(sel, h, note) {
  const e = $(sel);
  e.querySelector('b').textContent = tr('hero.' + h.kind);
  e.querySelector('canvas').dataset.sprite = h.kind === 'atez' && g.t < h.dreadTo ? 'dread' : h.kind;
  e.classList.toggle('down', !!h.down);
  e.querySelector('i').style.width = (100 * h.hp) / h.maxHp + '%';
  e.querySelector('u').style.width = Math.min(100, (100 * h.temp) / h.maxHp) + '%';
  e.querySelector('small').textContent = h.down
    ? `${tr('status.down')} ${'●'.repeat(h.down.ok)}${'○'.repeat(3 - h.down.ok)} ${'✕'.repeat(h.down.fail)}${'·'.repeat(3 - h.down.fail)}`   // death save 3 ผ่าน / 3 พลาด
    : `${h.hp}/${h.maxHp}` + (h.temp ? ` +${h.temp}` : '') + (h.hugger ? ` · ${tr('status.restrained')}` : '')
      + (g.t < h.poisonTo ? ` · ${tr('status.poisoned')}` : '') + (note ? ` · ${note}` : '');
}

function hud() {
  const me = g.heroes[g.ctrl], atez = g.heroes[1], s = g.stats;
  unit('#me', me);
  unit('#partner', g.heroes[1 - g.ctrl], tr('cmd.' + g.cmd));
  skills(me);
  const prev = LEVELS[g.level - 1] ?? 0, next = LEVELS[g.level];
  $('#xp i').style.width = next ? (100 * (g.xp - prev)) / (next - prev) + '%' : '100%';
  $('#chains').textContent = atez.stacks ? `${tr('hud.chains')} ${'●'.repeat(atez.stacks)}${'○'.repeat(Math.max(0, 5 - atez.stacks))}` : '';
  // Relic 3 ช่อง บรรทัดเดียว: ชื่อย่อ (ตัดวงเล็บ ยาวเกิน 12 ตัวอักษร ตัดที่ช่องว่างสุดท้าย ไม่มีช่องว่าง (ไทย) ตัดตามตัวอักษร)
  const short = s => {
    s = s.replace(/\s*\(.*\)/, '');
    if (s.length <= 12) return s;
    const cut = s.lastIndexOf(' ', 12);
    return (cut > 3 ? s.slice(0, cut).replace(/(\s+(of|the))+$/i, '') : s.slice(0, 11)) + '…';
  };
  $('#relics').textContent = [...me.relics.map(r => short(nameOf('relic.' + r))), ...Array(Math.max(0, ATTUNE - me.relics.length)).fill('·')].join(' | ')
    + (g.luck ? ` · ${tr('hud.luck', { n: g.luck })}` : '');
  // อาวุธเสริม: ช่องเล็กอักษรย่อ + เลเวล แถวเดียว (passive สีจางกว่า)
  const chips = [...me.weapons.map(w => ['w', w.id, w.lvl]), ...me.passives.map(p => ['p', p.id, p.lvl])];
  const sig = chips.join();
  if ($('#weapons').dataset.sig !== sig) {
    $('#weapons').dataset.sig = sig;
    $('#weapons').replaceChildren(...chips.map(([k, id, lv]) => {
      const name = nameOf((k === 'w' ? 'weapon.' : 'passive.') + id);
      const c = el('span', 'chip ' + k, name.split(/\s+/).map(x => x[0]).join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase());
      c.append(el('sub', null, lv));
      return c;
    }));
  }
  for (const e of $('#cmds').children) {
    e.textContent = `${Object.keys(CMD_KEYS).find(k => CMD_KEYS[k] === e.dataset.cmd).slice(5)} ${tr('cmd.' + e.dataset.cmd)}`;
    e.classList.toggle('on', g.cmd === e.dataset.cmd);
  }
  const boss = g.boss, bossOn = boss && boss.hp > 0;
  $('#bossbar').hidden = !bossOn;
  if (bossOn) {   // แถบ HP บอสบนสุด ขีดแบ่ง 50% ที่เปลี่ยนเฟส
    $('#bossbar b').textContent = tr('who.boss');
    $('#bossbar i').style.width = (100 * boss.hp) / BOSS.hp + '%';
  }
  const it = !g.modal && interactable(g, me);
  // ป้ายปิด elite: ยืนติดตัวที่คุกเข่า → หันหาแล้วกด J (Atez ปิดเอง = Trust +5)
  const kneel = !g.modal && g.enemies.find(e => e.kneel && Math.abs(e.x - me.x) + Math.abs(e.y - me.y) === 1);
  $('#prompt').textContent = it ? tr('act.' + it.kind, { name: tr('hero.' + (it.target?.kind ?? '')) })
    : kneel ? tr('act.finish.' + me.kind, { name: tr('who.' + kneel.kind) }) : '';
  const b = g.barks.at(-1), barkEl = $('#bark');
  barkEl.style.opacity = b && g.t - b.t < 2.5 ? 1 : 0;
  if (b) barkEl.replaceChildren(el('b', null, tr(strings['hero.' + b.who] ? 'hero.' + b.who : 'who.' + b.who) + ': '), tr('bark.' + b.key));
  $('#room-name').textContent = tr('room.' + g.roomId);
  $('#room-name').style.opacity = g.t - g.enteredAt < 2 ? 1 : 0;
  $('#controls').textContent = tr('msg.controls');
  $('#controls').style.opacity = g.t < 10 ? 0.8 : 0;
  if (g.log.length > logSeen) {   // เคลียร์ห้อง: สรุปตัววัดให้เทียบกับเป้าใน GDD-MVP 4 วิ
    logSeen = g.log.length;
    const r = g.log.at(-1);
    toast(tr('msg.stats', { dodged: r.warned - r.hit, warned: r.warned, lost: r.lost, secs: Math.round(r.clearT) }));
    if (rateOn) rate = { r, vals: [] };
    saveRun();
  }
  $('#toast').style.opacity = g.t - ($('#toast').dataset.at ?? -9) < 4 ? 1 : 0;
  $('#banner').hidden = g.state !== 'fail';
  if (g.state !== 'fail') return;
  $('#banner .dm').textContent = tr('dm.down');
  $('#banner .stats').textContent = tr('msg.stats', { dodged: s.warned - s.hit, warned: s.warned, lost: s.lost, secs: Math.round(g.t - g.enteredAt) });
  $('#banner .trust').textContent = tr('msg.trust', { trust: g.trust });
  $('#banner .next').textContent = tr('msg.next');
}

// ---------- หน้าจบ run: ตัววัดเทียบเป้า + เก็บ Relic ฉากจบไว้ใช้ run ถัดไป ----------
const METRICS = [
  ['roomTime', v => `${v.toFixed(0)} ${tr('unit.s')}`, ([a, b]) => `${a}–${b} ${tr('unit.s')}`],
  ['roomLost', v => v.toFixed(0), ([a, b]) => `${a}–${b}`],
  ['dodged', v => `${Math.round(v * 100)}%`, ([a, b]) => `${a * 100}–${b * 100}%`],
  ['bossTime', v => `${(v / 60).toFixed(1)} ${tr('unit.min')}`, ([a, b]) => `${a / 60}–${b / 60} ${tr('unit.min')}`],
  ['bossDeaths', v => String(v), ([a, b]) => `${a}–${b}`],
  ['trust', v => String(v), ([a, b]) => `${a}–${b}`],
  ['aiDanger', v => `${(v * 100).toFixed(1)}%`, ([, b]) => `< ${b * 100}%`],
];
// เก็บ log ทุกครั้งที่เคลียร์ห้อง (ปิดเกมกลางทางก็ไม่หาย) · done = เล่นจบ run
function saveRun(done = false) {
  const runs = store.get('runs', []).filter(r => r.id !== runId);
  store.set('runs', [...runs, { id: runId, at: runAt, done, hero: g.heroes[g.ctrl].kind, ending: g.ending ?? null, ...runSummary(g), rooms: g.log }]);
}
function download() {
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(store.get('runs', []), null, 2)], { type: 'application/json' }));
  a.download = 'grid-dungeon-runs.json';
  a.click();
}
function endScreen() {
  const box = $('#end'), show = g.state === 'over' && !g.modal;
  box.hidden = !show;
  if (!show) return;
  const sum = runSummary(g);
  if (!saved) {
    saved = true;
    store.set('legacy', ENDINGS[g.ending]);
    saveRun(true);
  }
  const page = el('div', 'page');
  page.append(el('h2', null, `${tr('end.title')} · ${tr('ending.' + g.ending)}`), el('p', null, tr('end.note')));
  const table = el('table');
  for (const [k, fmt, tfmt] of METRICS) {
    const v = sum[k], [lo, hi] = TARGETS[k], ok = v >= lo && v <= hi;
    const tr_ = el('tr', ok ? 'ok' : 'off');
    tr_.append(el('td', null, tr('metric.' + k)), el('td', null, fmt(v)), el('td', null, `${tr('end.target')} ${tfmt(TARGETS[k])}`), el('td', null, ok ? '✓' : '✗'));
    table.append(tr_);
  }
  page.append(table, el('p', 'help', tr('end.new')), el('p', 'help', tr('end.download')));
  box.replaceChildren(page);
}

// ---------- เสียง: จับเหตุการณ์จากสถานะเกม (sim ไม่รู้จักเสียง จึง port ไป Unity ได้ตรงๆ) ----------
const FX_SOUND = { swing: 'swing', beam: 'beam', strike: 'thud', dust: 'dust', heal: 'heal', shield: 'shield', block: 'block',
  bane: 'bane', save: 'save', weapon: 'weapon', dodge: 'dodge', crit: 'crit' };
const DICE = ['roll', 'contest', 'deathsave'];
const heard = new WeakSet(), lastHit = new WeakMap();
let lastTrust = null, lastModal = null, rolled = true;
function sounds() {
  for (const f of g.fx) if (!heard.has(f)) { heard.add(f); if (FX_SOUND[f.kind]) sfx(FX_SOUND[f.kind]); }
  for (const e of [...g.heroes, ...g.enemies]) {
    const was = lastHit.get(e);
    lastHit.set(e, e.hitAt);
    if (was !== undefined && e.hitAt > was) sfx(e.side === 'hero' ? 'hurt' : 'hit');
    if (e.windup && !heard.has(e.windup)) { heard.add(e.windup); sfx('warn_' + e.windup.name, 'warn'); }   // ไฟล์ต่อท่า เช่น warn_tray
  }
  if (lastTrust !== null && g.trust !== lastTrust) sfx('heart');   // ตัวเลือกที่กระทบ Trust: เสียงหัวใจเบาๆ ไม่บอกตัวเลข
  lastTrust = g.trust;
  const m = g.modal;
  if (m !== lastModal) {
    lastModal = m;
    rolled = !DICE.includes(m?.kind);
    if (m) sfx(!rolled ? 'dice' : m.kind === 'levelup' ? 'levelup' : 'page');
  }
  if (!rolled && !spinning()) { rolled = true; sfx(m.r === 20 ? 'nat20' : m.r === 1 ? 'crack' : 'diceStop'); }
  const boss = g.enemies.find(e => e.kind === 'boss' && e.hp > 0);
  music(g.state === 'over' && g.ending ? 'end' + g.ending
    : g.roomId === 'R6' && ['scene', 'confront', 'forgive', 'contest'].includes(m?.kind) ? 'confront'
    : boss ? (boss.phase === 2 ? 'boss2' : 'boss1')
    : g.enemies.some(active) ? 'fight' : 'explore');
}

// ---------- ให้คะแนนอารมณ์หลังเคลียร์ห้อง (T เปิด/ปิด) → rooms[].feel ใน log ----------
function rateView() {
  const box = $('#rate');
  box.hidden = !rate;
  if (!rate) return box.dataset.sig = '';
  const sig = rate.vals.join() + lang;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const page = el('div', 'box');
  const partner = g.heroes[1 - g.ctrl].kind;
  page.append(el('h2', null, `${tr('rate.title')} · ${tr('room.' + rate.r.room)}`));
  ['rate.tension', 'rate.bond', 'rate.annoy'].forEach((k, i) =>
    page.append(el('p', i === rate.vals.length ? 'now' : null, `${tr(k, { name: tr('hero.' + partner) })}: ${rate.vals[i] ?? '·'}`)));
  if (rate.vals.length === 3) {
    const input = el('input');
    input.placeholder = tr('rate.note');
    page.append(input);
    setTimeout(() => input.focus());
  }
  page.append(el('small', 'help', tr('rate.help')));
  box.replaceChildren(page);
}

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  for (; acc >= DT; acc -= DT) {
    if (journal || rate) continue;
    const recent = at => g.t - at < BUFFER;
    step(g, {
      dir: KEYS[held.at(-1)] || (recent(tapAt) ? tapDir : undefined),
      attack: attack || recent(attackAt),
      dodge: recent(dodgeAt),
      hold,
      ...pulse,
    }, DT);
    pulse = {};
  }
  draw(ctx, g);
  hud();
  modal();
  paintSprites();
  sounds();
  rateView();
  journalView();
  endScreen();
  requestAnimationFrame(frame);
}

document.documentElement.lang = lang;
globalThis.game = () => g;   // ดีบัก: พิมพ์ game() ในคอนโซลเพื่อดูสถานะ
newRun();
requestAnimationFrame(frame);
