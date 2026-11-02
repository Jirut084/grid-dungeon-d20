// ตัวเลขเกมทั้งหมดจาก GDD-MVP ("ตัวเลขสมดุล", "ศัตรูในคฤหาสน์") — ปรับสมดุลที่ไฟล์นี้ที่เดียว
// ตอน port ไป Unity ไฟล์นี้กลายเป็น ScriptableObject
// ลูกเต๋าเขียนเป็น [จำนวน, หน้า, โบนัส] เช่น 1d8+3 = [1, 8, 3] · เวลาเป็นวินาที
// ค่าที่เขียนว่า "ไม่มีใน GDD" คือค่าที่ Claude เดาไว้ให้เล่นได้ก่อน รอผู้ออกแบบตัดสิน

export const HEROES = {
  york: {
    level: 5, hp: 59, ac: 19, move: 0.20,
    dodge: { cells: 1, iframe: 0.12, cd: 0.9 },
    attack: { kind: 'melee', dice: [1, 8, 3], cd: 0.6 },              // Morningstar ช่องหน้า
    channel: { max: 2, regen: 15 },                                    // Channel Divinity 2 แต้ม ฟื้นแต้มละ 15 วิ
    vow: { dur: 10, range: 6 },                                        // Vow of Enmity: ตีเป้านี้ได้ Advantage · ระยะ: ไม่มีใน GDD
    smite: { uses: 3, dice: [3, 8, 0] },                               // 2d8 +1d8 กับ undead
    grab: { cd: 4, throw: 3, stun: 1.5, dice: [1, 6, 0] },             // Grappler: โยน 3 ช่อง ชนของ = Stunned + 1d6
    lay: { pool: 25, hold: 1.0 },                                      // Lay on Hands · เวลากดค้าง: ไม่มีใน GDD
    stone: { cd: 25, window: 0.5, dice: [1, 12, 5] },                  // Stone's Endurance (reaction) · ช่วงกด: ไม่มีใน GDD
  },
  atez: {
    level: 6, hp: 33, ac: 14, move: 0.16,
    dodge: { cells: 2, iframe: 0.15, cd: 0.7 },
    attack: { kind: 'beam', dice: [1, 10, 7], beams: 2, range: 8, cd: 1.4 }, // Eldritch Blast 2 ลำ
    dread: { uses: 3, dur: 10, temp: [1, 10, 6], dc: 18, fear: 2, extra: [1, 10, 0] }, // fear (วิ): ไม่มีใน GDD
    pact: { slots: 2, bane: { dur: 10, dice: [1, 4, 0], range: 8 } },   // Pact slot 2 · Bane: ศัตรูใน 3×3 ดาเมจ −1d4 นาน 10 วิ
    chains: { max: 5, decay: 6, slow: 0.05 },                          // พันธนาการรัก
  },
};

// กอด (เฉพาะครอบครัว): ยืนติด 1.5 วิ → ช่องม่วงรอบ Atez 1.0 วิ → Restrained 2 วิ (ครบ 5 stack = 4 วิ)
const HUG = { near: 1.5, warn: 1.0, hold: 2, holdFull: 4, cd: 8, mash: 3 };

export const ENEMIES = {
  footman: {
    hp: 24, move: 0.6, xp: 1, servant: true,
    tray:   { warn: 0.8, dice: [1, 8, 2], cd: 2.5 },                         // แถว 3 ช่องตรงหน้า
    charge: { warn: 1.0, dice: [1, 10, 2], cd: 6, len: 4, min: 2, max: 4 },  // เส้น 4 ช่อง ผลักถอย 1
  },
  maid: {
    hp: 14, move: 0.4, xp: 1, servant: true, keep: [3, 4],
    plate: { warn: 0.7, dice: [1, 6, 1], cd: 2.0, len: 5 },                  // เส้นตรง 5 ช่อง
    flee:  { cd: 5, cells: 2 },
  },
  kinsman: {
    hp: 36, move: 0.45, xp: 2, family: true,
    lunge: { warn: 0.6, dice: [1, 8, 3], cd: 3, len: 3, chain: 1 },          // แทงพุ่งเส้น 3 ช่องแล้วพุ่งไปปลายเส้น
    parry: { dur: 1.0, cd: 5 },                                              // โดนตีด้านหน้า → กันด้านหน้า
    hug: HUG,
  },
  kinswoman: {
    hp: 28, move: 0.5, xp: 2, family: true, keep: [3, 4],
    fan: { warn: 1.2, cd: 5, range: 6, spots: 1, zone: 4, tick: 0.5, dice: [1, 4, 0] }, // ระยะ: ไม่มีใน GDD
    lullaby: { warn: 1.5, cd: 8, radius: 2, heal: 6, self: false },
    hug: HUG,
  },
  brother: {   // ลูเซียน อัมบรา [เสนอชื่อ]
    hp: 140, move: 0.45, xp: 8, family: true, elite: true,
    lunge: { warn: 0.6, dice: [1, 8, 3], cd: 3, len: 3, chain: 2 },          // ครั้งที่สองหักมุม 90° เข้าหา York
    parry: { dur: 2.0, cd: 5 },
    summon: { kind: 'footman', count: 2, every: 0.25 },                      // ทุก 25% HP
    hug: HUG,
  },
  mother: {    // เลดีเซราฟีน อัมบรา [เสนอชื่อ]
    hp: 120, move: 0.5, xp: 8, family: true, elite: true, keep: [3, 4],
    fan: { warn: 1.2, cd: 5, range: 6, spots: 2, zone: 4, tick: 0.5, dice: [1, 4, 0] },
    lullaby: { warn: 1.5, cd: 8, radius: 2, heal: 10, self: true },
    hug: { ...HUG, hold: 3, holdFull: 4 },
  },
  maggot: { hp: 8, move: 0.5, xp: 1, boom: { warn: 0.8, dice: [1, 6, 0], cd: 99 } },   // ลูกน้ำ: ติดตัว York แล้วระเบิด 3×3
  pustule: { hp: 25, xp: 0 },                                                         // ตุ่มหนองของบอส
  heart: { hp: 9999, xp: 0 },                                                         // หัวใจบอส (เฟส 2)
  boss: { hp: 1600, xp: 0, size: 2 },                                                 // ก้อนเนื้อโสมม 2×2
};

// ตัวอักษรใน room template → ชนิดศัตรู (ตัวที่ยังไม่มีในนี้จะแสดงเป็นตัวอักษรจางๆ)
export const SPAWN = { f: 'footman', m: 'maid', k: 'kinsman', w: 'kinswoman' };

// คลื่นศัตรูตามตาราง "ห้องในคฤหาสน์" — คลื่นแรก = ตัวอักษรในไฟล์ + waves[0] ที่ช่อง ?
// elite เกิดที่ช่อง E พร้อมคลื่นสุดท้าย
export const ROOMS = {
  R1:  { waves: [['footman', 'footman', 'maid', 'maid'], ['kinsman', 'kinsman']], elite: 'brother' },
  R2a: { waves: [[], ['kinsman', 'footman', 'footman']] },          // [ปรับจาก log] คลื่น 2 เข้าทางประตู (ห้องนี้ไม่มีช่อง ?)
  R2b: { waves: [[], ['maid', 'maid', 'footman', 'footman']] },     // [ปรับจาก log] เดิม สาวใช้ 2
  R4:  { waves: [['kinswoman', 'maid', 'maid'], []], elite: 'mother' },
};

// การล้ม: death save ทุก 2 วิ · ชุบ = ยืนติดกดค้าง 2 วิ ลุก HP 25% · ล้มเกิน 10 วิ = Trust −5
export const DOWN = { save: 2, revive: 2, reviveHp: 0.25, late: 10 };

// Trust [ค่าที่เปลี่ยน, เพดานต่อ run] จาก GDD หมวด 8 + GDD-MVP
export const TRUST = {
  start: 50,
  shield: [1, 5],      // Atez บังด้วยความรักให้ York
  freeHug: [2, 6],     // York ตีซากศพที่กำลังกอด Atez
  revive: [5, 99],     // ชุบคู่หูทันเวลา
  late: [-5, -99],     // ปล่อยคู่หูล้มเกิน 10 วิ
  finish: [5, 10],     // Atez ปิดแม่หรือพี่ชายด้วยมือตัวเอง
  pray: [10, 10],      // York สวดให้ศพอัศวินครบ 7 ศพ
  lie: [-10, -10],     // โกหกหรือเงียบในองก์ 2 (ผู้เล่นเป็น Atez)
  silent: [-10, -10],  // เงียบในฉากเผชิญหน้า
  grabAtez: [3, 9],    // York จับ Atez ไว้ตอนบอสดูด
  swarm: [-5, -10],    // [เสนอ] Atez ปล่อยซากศพรุม York: ศัตรู ≥2 ตัวติด York นาน 6 วิ โดย Atez ไม่ยิงตัวไหนเลย
};
export const SWARM = { count: 2, time: 6 };

export const AI = {
  damage: 0.8,         // AI ทำดาเมจ 80% (GDD หมวด 10)
  think: 0.1,          // คิดทุก 0.1 วิ (grid tick) · ไม่มีใน GDD
  finishWait: 5,       // รอผู้เล่นปิด elite 5 วิ ก่อน AI ตัดสินใจ
  finishTrust: 60,     // AI Atez ปิดเองเมื่อ Trust ≥ 60
  quirk: { chance: 0.15, cd: 20, dur: 4 },  // York พุ่งใส่ตัวใหญ่ตามใจ · ไม่มีใน GDD
  shield: { hp: 0.3, stacks: 3 },           // AI Atez ตั้งใจบังช่องแดงให้ York เมื่อ York HP < 30% และ stack < 3
};

export const ENEMY_WIS = -2;   // saving throw ของซากศพ
// ไม่มีใน GDD: เวลาพักหลังศัตรูลงท่า กันไม่ให้ต่อท่ารัว
export const RECOVER = 0.3;
// GDD: เคลียร์ห้องต่อสู้ = ฟื้น HP 25%
export const CLEAR_HEAL = 0.25;

// ================= M3: ห้อง ประตู ของในห้อง ความก้าวหน้าใน run =================

// ประตูเชื่อมห้อง: ด้านของประตู → [ห้องปลายทาง, ด้านของประตูที่โผล่ในห้องนั้น] · null = ปิดตาย
// [เสนอ] Claude จัดผังเอง: ออกทางไหนโผล่อีกฝั่งของห้องถัดไป · R1 → R2a (ครอบครัว) หรือ R2b (คนรับใช้) → R3 เป็น loop
export const LINKS = {
  R0: { N: ['R1', 'S'], S: null },
  R1: { S: ['R0', 'N'], W: ['R2a', 'E'], E: ['R2b', 'W'] },
  R2a: { E: ['R1', 'W'], W: ['R3', 'E'] },
  R2b: { W: ['R1', 'E'], E: ['R3', 'W'] },
  R3: { E: ['R2a', 'W'], W: ['R2b', 'E'], N: ['R4', 'S'] },
  R4: { S: ['R3', 'N'], E: ['R5', 'W'] },
  R5: { W: ['R4', 'E'], E: ['R6', 'S'] },
  R6: { S: ['R5', 'E'] },
};
export const START = 'R0';

// skill check (ตาราง "DC ในคฤหาสน์" โบนัสจากชีตจริง) · ผู้เล่นเลือกว่าใครทอย
export const CHECKS = {
  medicine: [{ hero: 'york', skill: 'medicine', dc: 13, bonus: 4 }, { hero: 'atez', skill: 'medicine', dc: 13, bonus: -1 }],
  ledger: [{ hero: 'york', skill: 'investigation', dc: 13, bonus: 0 }, { hero: 'atez', skill: 'investigation', dc: 13, bonus: 6 }],
  door: [
    { hero: 'york', skill: 'athletics', dc: 14, bonus: 6 }, { hero: 'atez', skill: 'athletics', dc: 14, bonus: -3 },
    { hero: 'atez', skill: 'deception', dc: 12, bonus: 10 },   // หลอกผีคนรับใช้ให้เปิดประตูให้ "นายน้อย"
  ],
};
export const EVENTS = { R2b: 'medicine', R3: 'ledger', R5: 'censer' };   // วัตถุ 'e' ของแต่ละห้อง
export const LOCKED = { R5: { side: 'E', check: 'door' } };             // ประตูที่ต้องทอยเปิด
export const CHESTS = { R2a: 'ring', R3: 'pair' };                       // หีบ 'c'
export const CLEAR_REWARD = { R2b: 'bell' };                             // [เสนอ] กระดิ่งได้ตอนเคลียร์ครัว
export const POTION = [2, 4, 2];                                         // ยาฮีล 2d4+2
export const POISON = 6;                                                 // ทอยตู้ยาพลาด = Poisoned 6 วิ
export const PRAY = { hold: 3, total: 7 };                               // สวด: ยืนนิ่ง 3 วิ ครบ 7 ศพ = Trust +10
export const SPEAK = { full: 70, part: 40, partCount: 2 };               // AI Atez เล่าตาม Trust
export const REST = { heal: 0.5 };                                       // Short Rest
export const CHANDELIER = { warn: 0.8, dice: [3, 10, 0] };               // คันโยกโคมระย้า R1
export const STOVE = { period: 3, warn: 0.6, tick: 0.5, dice: [1, 6, 0] }; // [เสนอ] เตาไฟ R2b: ดาเมจไม่มีใน GDD
export const BELL = { charm: 3 };
export const SUMMON_ON_FAIL = { ledger: ['maid', 'maid'], door: ['footman', 'footman'] };

// XP และเลเวลอัป (เกณฑ์สะสม)
export const LEVELS = [3, 7, 12, 18, 25, 32, 40, 50];
export const LUCK = 3;   // Feat Lucky: แต้มโชคต่อชั้น

// อาวุธเสริม (ยิงเองตามคูลดาวน์ ถือได้ 4 ชิ้น อัปถึง Lv5) — ของฮีโร่ที่ผู้เล่นคุม
export const WEAPONS = {
  holyCross: { passive: 'blessCharm', evo: 'radiantStar', dice: [1, 6, 0], cd: 2.0, range: 2 },
  plagueSwarm: { passive: 'rottenTome', evo: 'lordsSwarm', dice: [1, 4, 0], cd: 1.2, cells: 3, poison: 2 },
  stormRing: { passive: 'thunderDrum', dice: [1, 6, 0], cd: 2.5, shock: 0.5 },
  thrownBlade: { passive: 'whetstone', dice: [1, 6, 0], cd: 1.0, range: 6 },
  radiantStar: { evolved: true, dice: [2, 6, 0], cd: 1.2, range: 3, undead: 1.5 },   // ×1.5 กับ undead (ทุกตัวในคฤหาสน์)
  lordsSwarm: { evolved: true, dice: [1, 6, 0], cd: 1.2, flies: 6, range: 5, poison: 2 },
};
export const PASSIVES = {
  blessCharm: { check: 1, radiant: 0.05 },   // ต่อเลเวล: skill check/death save +1 · ดาเมจ radiant +5%
  rottenTome: { poison: 0.5, area: 0.1 },    // Poisoned +0.5 วิ · พื้นที่ +10%
  thunderDrum: { cd: 0.04 },                 // คูลดาวน์อาวุธทุกชิ้น −4%
  whetstone: { crit: 0.01 },                 // โอกาสคริต +1%
};
export const GEAR = { weapons: 4, passives: 4, maxLevel: 5, startPair: 2 };

// Relic (attune ฮีโร่ละ 3 ช่อง)
export const ATTUNE = 3;
export const RELICS = {
  // ของจากฉากจบอยู่ใน ENDING_RELICS ด้านล่าง (รวมเข้าตารางนี้ตอนท้ายไฟล์)
  ring: { who: 'any' },        // AC +1
  amulet: { who: 'any', hp: { york: 0, atez: 24 } },   // CON 19: Atez 33 → 57 · York ไม่มีผล
  gauntlets: { who: 'any' },   // STR 19: York ประชิด +1 โยนไกล +1
  rod: { who: 'atez', pact: 1 },   // Eldritch Blast +1 · Spell DC 19 · ฟื้น Pact slot 1 ครั้งต่อชั้น
  seal: { who: 'york', lay: 10, share: 0.5, range: 2 },   // ตราวิหาร: Lay on Hands 25 → 35 · ฮีลตัวเองแบ่งคู่หู 50%
  shawl: { who: 'atez', stacks: 3 },                      // ผ้าคลุมไหล่ของแม่: ครอบครัวกอดไม่ได้ · stack สูงสุด 3
  bell: { who: 'atez' },                                  // กระดิ่ง: คนรับใช้ Charmed 3 วิ ห้องละครั้ง
  censer: { who: 'atez', cursed: true, dmg: 1.4, kills: 10 },   // กระถางกำยานแตก (Cursed)
};
export const AMULET_CHANCE = 0.1;   // การ์ด Amulet of Health (หายาก)

// Feat (ออกไม่เกิน 1 ใบต่อการสุ่ม เลือกได้ครั้งเดียว)
export const FEATS = {
  tough: 'any', alert: 'any', mobile: 'any', lucky: 'any', warCaster: 'any',
  heavyArmor: 'york', forgetPlan: 'york', vowChain: 'york', spellSniper: 'atez', loveDenied: 'atez',
};
export const FEAT = {
  tough: 2,                                   // HP สูงสุด +2 ต่อเลเวล
  alert: { warn: 0.15, wait: 1 },
  mobile: { cells: 1, cd: 0.2 },
  heavyArmor: 3,
  forgetPlan: { cd: 8, cells: 3, dice: [1, 8, 0], prone: 1 },   // prone (วิ): ไม่มีใน GDD
  spellSniper: { range: 4 },
  loveDenied: { temp: 4 },
};

// ================= M4: บอส ฉากเผชิญหน้า ฉากจบ =================

// บอส: ก้อนเนื้อโสมม (GDD-MVP "บอส") · HP 1,600 เฟสละ 800 · ตัวบอสรับดาเมจ ×0.5 ตุ่มหนองรับ ×1 (นับเข้า HP บอสด้วย)
export const BOSS = {
  hp: 1600, body: 0.5, phase2: 0.5, cutscene: 3,
  exposed: { dur: 4, mul: 1.5 }, heartMul: 2, heartDur: 3,
  pustules: { hp: 25, regrow: 12 },
  seal: { rotate: 10, hold: 2, slow: 8, mul: 1.5 },       // York ยืนบนแผ่นสว่าง 2 วิ + Channel Divinity → Slowed 8 วิ
  finale: { at: 0.1, dur: 10, rain: 2 },                  // [ตีความ] HP 10%: อมตะ 10 วิ ฝนแมลงวัน ×2 แล้วฟุบ
  p1: {
    ripple: { every: 9, warn: 0.9, step: 0.4, rings: [2, 4, 6], dice: [2, 6, 0] },
    rain: { every: 7, warn: 1.2, cells: 6, dice: [1, 10, 0] },
    whip: { every: 6, warn: 1.0, len: 6, dice: [2, 8, 0], prone: 1 },
    eggs: { every: 15, warn: 0.8, count: 2 },
  },
  p2: {
    crawl: 3,
    suction: { every: 12, warn: 1.5, pull: 0.5, dur: 3 },
    breath: { every: 10, warn: 1.4, len: 6, dice: [3, 6, 0], poison: 3 },
    ripple: { every: 9, warn: 0.9, step: 0, rings: [3, 5], dice: [2, 6, 0] },
    rain: { every: 7, warn: 1.2, cells: 6, dice: [1, 10, 0] },
  },
  swallow: { dice: [3, 6, 0], tick: 1, heal: 0.01, free: 30, smites: 2 },
  rot: { every: 30, tick: 0.5, dice: [1, 4, 0] },          // โรคกินพื้นจากขอบสนาม
  plague: { spread: 1, outside: 0.5, limit: 10 },          // Atez ล้ม: โรคขยาย 1 ช่อง/วิ (นอกไฟต์บอส 0.5) · ไฟต์บอสแพ้ถ้าล้มเกิน 10 วิ
  first: { ripple: 4, rain: 2, whip: 3, eggs: 6, suction: 6, breath: 3 },   // หน่วงท่าแรกของแต่ละท่า · ไม่มีใน GDD
};

// ฉากเผชิญหน้า (GDD หมวด 8): สารภาพ → A (Trust ≥ 50) / D · โกหก: Deception d20+10 แข่ง Insight d20+4 (+5 ถ้า Trust < 40) เสมอ = โกหกพลาด
export const CONFRONT = { forgive: 50, deception: 10, insight: 4, wary: 40, waryBonus: 5, aiConfess: 70, aiLie: 40 };

// Relic จากฉากจบ (ติดตัวไปทุก run หลังจากนี้) · pair = ได้ทั้งคู่
export const ENDINGS = {
  A: ['oathNew'], B: ['secretShared'], C: ['vengeance', 'hollowShell'], D: ['loneShield', 'truthVoice'],
};
export const ENDING_RELICS = {
  oathNew: { who: 'pair', near: 3, dmg: 0.15, layRange: 3 },
  secretShared: { who: 'pair', near: 3, dmg: 0.25, far: 6 },          // [เสนอ]
  vengeance: { who: 'york', vowDmg: 0.25, lay: -10 },
  hollowShell: { who: 'atez', dread: 1, dur: 5, hp: -5 },
  loneShield: { who: 'york', stoneCd: 10, alone: 3, taken: 0.1 },      // [เสนอ]
  truthVoice: { who: 'atez', check: 2, alone: 3, dmg: 0.1 },          // [เสนอ]
};

// เป้าตัววัดใน GDD-MVP "การทดสอบ"
export const TARGETS = {
  roomTime: [25, 45], roomLost: [15, 30], dodged: [0.6, 0.75], bossTime: [120, 240], bossDeaths: [1, 3], trust: [40, 70], aiDanger: [0, 0.05],
};
Object.assign(RELICS, ENDING_RELICS);
