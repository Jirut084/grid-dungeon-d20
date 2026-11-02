// asset ชั่วคราว: pixel art แบบตัวอักษร (1 ตัว = 1 pixel · '.' = โปร่งใส) ขยาย ×2 เป็น 32 px ต่อช่อง · ทุกตัวละคร 16×16 → 32×32 (บอส 64×64)
// สีและรูปทรงจาก GDD หมวด 5 "รูปลักษณ์" · ของจริงจากผู้ออกแบบ/ศิลปินมาแทนได้ทีละชื่อ (buildSprites คืน map ชื่อ → canvas)
// พื้น กำแพง และบอส สร้างด้วยโค้ด (procedural)
const K = '#1a1420';   // เส้นขอบ (ตัว k)
const UNDEAD = { s: '#a7b39a', e: '#2a2a20' };   // ผิวซากศพในคฤหาสน์
const small = rows => [...Array(8).fill('.'.repeat(16)), ...rows.map(r => '....' + r + '....')];   // ตัวเล็ก 8×8 วางกลางล่างของกรอบ 16×16

export const ART = {
  york: {   // Goliath ตัวใหญ่ ผิวเทาลายเข้ม ผมขาว รอยแดงพาดจมูก เกราะเข้ม ขนสัตว์ขาวที่ไหล่ ค้อนศึก
    pal: { h: '#ecebf0', s: '#8b919c', S: '#5c6270', r: '#c33b3b', f: '#efece2', a: '#3b4150', A: '#5d6678', b: '#6b4a2b', m: '#b9bec8', w: '#7a5a3a' },
    rows: [
      '......kkkk......',
      '.....khhhhk.....',
      '....khhsshhk....',
      '....khsrrshk....',
      '....khsSSshk....',
      '...khhkssskhhk..',
      '..kffkaaaakffk..',
      '.kfffaaAAaafffk.',
      '.kssaaaaaaaasskm',
      '.kskbbbbbbbbkskm',
      '..kkaaaaaaaakkmm',
      '...kaaakkaaak.w.',
      '...kaaak.kaaak.w',
      '...kAak...kaAk.w',
      '..kaaak...kaaakw',
      '..kkkkk...kkkkk.',
    ],
  },
  atez: {   // เขากวางน้ำตาล ผมบลอนด์ปลายม่วง ตาแดง ผิวซีด เสื้อคลุมน้ำตาล เสื้อเขียว ไม้เท้าดำ
    pal: { t: '#8a5a32', y: '#e9d27a', v: '#9b5ccb', p: '#ecdfd3', r: '#d22b2b', c: '#6b4528', g: '#4b7c3b', n: '#1b1b1b', b: '#3a2a1a' },
    rows: [
      '..t.t......t.t..',
      '..tt........tt..',
      '...tt.kkkk.tt...',
      '....tkyyyykt....',
      '.....kyppyyk....',
      '.....kprprpk....',
      '.....vkppppkv...',
      '.....vkkppkkv..n',
      '....kccggggcck.n',
      '...kccggggggccpn',
      '...kcccccccccckn',
      '....kcccckcccckn',
      '....kccck.kccckn',
      '.....kgk...kgk.n',
      '.....kbk...kbk.n',
      '.....kkk...kkk..',
    ],
  },
  footman: {   // คนรับใช้ชาย ชุดกรมท่า เสื้อเชิ้ตขาว ถือถาดเงิน
    pal: { ...UNDEAD, H: '#4a4a40', C: '#2c3a5a', w: '#e6e2d6', x: '#c9ccd4', L: '#23232b' },
    rows: [
      '......kkkk......',
      '.....kHHHHk.....',
      '.....kssssk.....',
      '.....kesesk.....',
      '.....kssssk.....',
      '......kssk......',
      '....kkCwwCkk....',
      '...kCCCwwCCCk...',
      '..kxxCCwwCCCk...',
      '.kxxxxCwwCCsk...',
      '..kkkCCCCCCk....',
      '....kLLLLLLk....',
      '....kLLkkLLk....',
      '....kLLk.kLLk...',
      '....kLLk..kLLk..',
      '....kkkk..kkkk..',
    ],
  },
  maid: {   // สาวใช้ ชุดดำ ผ้ากันเปื้อนขาว ถือกองจาน
    pal: { ...UNDEAD, w: '#ece8dc', H: '#5a3a2a', C: '#2a2230', x: '#e8e8f0', L: '#1d1d24' },
    rows: [
      '.....kwwwwk.....',
      '....kwHHHHwk....',
      '.....kssssk.....',
      '.....kesesk.....',
      '.....kssssk.....',
      '......kssk......',
      '.....kCCCCk.....',
      '....kCwwwwCk..x.',
      '...kCCwwwwCCkxxx',
      '...ksCwwwwCCkxxx',
      '...kCCwwwwCCsk..',
      '..kCCCwwwwCCCk..',
      '.kCCCCCCCCCCCCk.',
      '.kkkkkkkkkkkkkk.',
      '.....kLk.kLk....',
      '.....kkk.kkk....',
    ],
  },
  kinsman: {   // ญาติชาย ขุนนาง เสื้อคลุมสีไวน์ ผ้าผูกคอทอง ไม้เท้าดาบ
    pal: { ...UNDEAD, H: '#6a5a4a', g: '#d8b450', C: '#6a2030', L: '#2a2a30', x: '#c0c4cc' },
    rows: [
      '......kkkk......',
      '.....kHHHHk.....',
      '.....kssssk.....',
      '.....kesesk.....',
      '.....kssssk.....',
      '......kggk......',
      '....kkCggCkk....',
      '...kCCCggCCCk...',
      '...kCCCggCCCkx..',
      '...ksCCggCCsk.x.',
      '...kCCCCCCCCk.x.',
      '...kCCkCCkCCk.x.',
      '....kLLkkLLk..x.',
      '....kLLk.kLLk...',
      '....kLLk.kLLk...',
      '....kkkk.kkkk...',
    ],
  },
  kinswoman: {   // ญาติหญิง ชุดราตรีน้ำเงิน ผมทรงสูง ถือพัด
    pal: { ...UNDEAD, H: '#7a4a3a', g: '#e0c070', C: '#4a5a8a', c: '#34406a', x: '#d8a8c8' },
    rows: [
      '.....kkkkkk.....',
      '....kHHHHHHk....',
      '....kHssssHk....',
      '....kHesesHk....',
      '.....kssssk.....',
      '......kssk......',
      '.....kCCCCk.....',
      '....kCCggCCk.xx.',
      '...kCCCggCCCkxxx',
      '...ksCCggCCsk.x.',
      '...kCCCCCCCCk...',
      '..kCCCCCCCCCCk..',
      '.kCCCCCCCCCCCCk.',
      '.kCCCCCCCCCCCCk.',
      '.kcccccccccccck.',
      '.kkkkkkkkkkkkkk.',
    ],
  },
  maggot: {
    pal: { w: '#d8d0b0' },
    rows: small(['........', '..kkkk..', '.kwwwwk.', 'kwkwwkwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..', '........']),
  },
  pustule: {
    pal: { y: '#c8d860', Y: '#f0f8b0' },
    rows: small(['..kkkk..', '.kyyyyk.', 'kyYyyyyk', 'kyyyyyyk', 'kyyyyYyk', '.kyyyyk.', '..kkkk..', '........']),
  },
  heart: {
    pal: { r: '#d8304a' },
    rows: small(['.kk..kk.', 'krrkkrrk', 'krrrrrrk', 'krrrrrrk', '.krrrrk.', '..krrk..', '...kk...', '........']),
  },
  // ---------- ของในห้อง (16×16 ต่อช่อง) ----------
  K: {   // ศพอัศวินวิหารเปลวรุ่ง นอนอยู่
    pal: { H: '#c8c8c8', s: '#9aa0a8', a: '#6a7080', r: '#c84030', m: '#c0c4cc' },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '..kkk.kkkkkkk...',
      '.kHsskaaaaaaak..',
      '.kssskarrraak.m.',
      '.kHsskaaaaaaak..',
      '..kkk.kkkkkkk...',
      '................', '................', '................', '................', '................',
    ],
  },
  T: {   // โต๊ะยาว
    pal: { w: '#7a5236', W: '#8e6444' },
    rows: [
      '................', '................',
      '.kkkkkkkkkkkkkk.', '.kwwwwwwwwwwwwk.', '.kwWwwwwwWwwwwk.', '.kwwwwwwwwwwwwk.', '.kwwwwWwwwwwwwk.',
      '.kwwwwwwwwwWwwk.', '.kwwwwwwwwwwwwk.', '.kWwwwwwwwwwwwk.', '.kwwwwwwwwwwwwk.', '.kwwwwwWwwwwwwk.',
      '.kwwwwwwwwwwwwk.', '.kkkkkkkkkkkkkk.', '..k..........k..', '................',
    ],
  },
  p: {   // เสาหิน (บังลำแสงและลมหายใจ)
    pal: { g: '#8a8494', G: '#b0aab8' },
    rows: [
      '...kkkkkkkkkk...', '...kGGGGGGGGk...', '...kkkkkkkkkk...',
      ...Array(10).fill('....kgGggggk....'),
      '...kkkkkkkkkk...', '...kGGGGGGGGk...', '...kkkkkkkkkk...',
    ],
  },
  b: {   // ตู้ / เตียง
    pal: { b: '#4d3b52', y: '#c8a050' },
    rows: [
      '................', '.kkkkkkkkkkkkkk.',
      ...Array(5).fill('.kbbbbbkkbbbbbk.'), '.kbbbbykkybbbbk.', ...Array(6).fill('.kbbbbbkkbbbbbk.'),
      '.kkkkkkkkkkkkkk.', '................',
    ],
  },
  h: {   // เตาไฟ
    pal: { i: '#3a3036', I: '#5a5058', o: '#c85a1e', O: '#ffb040' },
    rows: [
      '................', '.kkkkkkkkkkkkkk.', '.kiiiiiiiiiiiik.', '.kiIiiiiiiiiIik.', '.kiikkkkkkkkiik.',
      '.kiikooooookiik.', '.kiikoOOOOokiik.', '.kiikoOOOOokiik.', '.kiikooooookiik.', '.kiikkkkkkkkiik.',
      '.kiiiiiiiiiiiik.', '.kiIiiiiiiiiIik.', '.kiiiiiiiiiiiik.', '.kkkkkkkkkkkkkk.', '..kk........kk..', '................',
    ],
  },
  '|': {   // ลูกกรง
    pal: { i: '#5a5560' },
    rows: ['iiiiiiiiiiiiiiii', ...Array(14).fill('.ii.ii.ii.ii.ii.'), 'iiiiiiiiiiiiiiii'],
  },
  c: {   // หีบ
    pal: { w: '#7a5236', W: '#a8862e', g: '#e8c850' },
    rows: [
      '................', '................', '................', '................',
      '..kkkkkkkkkkkk..', '.kwwwwwwwwwwwwk.', '.kwWWWWWWWWWWwk.', '.kkkkkkggkkkkkk.', '.kwwwwwggwwwwwk.',
      '.kwwwwwwwwwwwwk.', '.kwwwwwwwwwwwwk.', '.kkkkkkkkkkkkkk.',
      '................', '................', '................', '................',
    ],
  },
  e: {   // วัตถุอีเวนต์ (ตู้ยา / สมุดบัญชี / ช่องกำแพง)
    pal: { d: '#3f6f8a', p: '#e8dcc0', P: '#c83a3a', b: '#a8862e' },
    rows: [
      '................', '..kkkkkkkkkkkk..', '..kddddddddddk..', '..kdkkkkkkkkdk..', '..kdkppppppkdk..',
      '..kdkpPPPPpkdk..', '..kdkppppppkdk..', '..kdkkkkkkkkdk..', '..kddddddddddk..', '..kdkkkkkkkkdk..',
      '..kdkbbbbbbkdk..', '..kdkkkkkkkkdk..', '..kddddddddddk..', '..kkkkkkkkkkkk..', '...kk......kk...', '................',
    ],
  },
  L: {   // คันโยกโคมระย้า
    pal: { m: '#9a7a3a', b: '#6b4a2b' },
    rows: [
      '................', '................', '................', '................', '................',
      '..........kk....', '.........kmk....', '........kmk.....', '.......kmk......', '......kmk.......',
      '.....kmk........', '....kkk.........', '..kkkkkkkk......', '..kbbbbbbk......', '..kkkkkkkk......', '................',
    ],
  },
  S: {   // แผ่นผนึกของ Grand Master
    pal: { s: '#6a6070', S: '#8a8094' },
    rows: [
      '................', '....kkkkkkkk....', '...kssssssssk...', '..kssSSSSSSssk..', '..ksSssssssSsk..',
      '..ksSsSSSSsSsk..', '..ksSsSssSsSsk..', '..ksSsSssSsSsk..', '..ksSsSSSSsSsk..', '..ksSssssssSsk..',
      '..kssSSSSSSssk..', '...kssssssssk...', '....kkkkkkkk....', '................', '................', '................',
    ],
  },
  r: {   // จุดพัก (ที่นอน)
    pal: { w: '#e8e0d0', r: '#7a3a3a', R: '#9a5a4a' },
    rows: [
      '................', '................', '................', '................', '................',
      '..kkkkkkkkkkkk..', '.kwwkrrrrrrrrrk.', '.kwwkrRrrrrRrrk.', '.kwwkrrrrrrrrrk.', '.kwwkrrRrrrRrrk.',
      '.kwwkrrrrrrrrrk.', '..kkkkkkkkkkkk..', '................', '................', '................', '................',
    ],
  },
  D: {   // ประตู
    pal: { d: '#6b4a2b', D: '#57391f', y: '#d8b050' },
    rows: [
      '.kkkkkkkkkkkkkk.', '.kddddddddddddk.', '.kdDDDDkkDDDDdk.', '.kdDddDkkDddDdk.', '.kdDddDkkDddDdk.',
      '.kdDDDDkkDDDDdk.', '.kddddddddddddk.', '.kddddddddddydk.', '.kddddddddddddk.', '.kdDDDDkkDDDDdk.',
      '.kdDddDkkDddDdk.', '.kdDddDkkDddDdk.', '.kdDDDDkkDDDDdk.', '.kddddddddddddk.', '.kddddddddddddk.', '.kkkkkkkkkkkkkk.',
    ],
  },
};

// สลับสีจากตัวอื่น (elite ตาม GDD-MVP: "สลับสีจากญาติ") · ร่าง Form of Dread · ศพอัศวินพิเศษ · แผ่นผนึกสว่าง/แตก
export const VARIANTS = {
  brother: ['kinsman', { H: '#c8b890', g: '#e8e0c8', C: '#8a6a20', x: '#e0e4ec' }],
  mother: ['kinswoman', { H: '#b8b8c0', C: '#c8b8c8', c: '#a898a8', g: '#e8d8e8', x: '#f0c0d8' }],   // ผ้าคลุมหน้า ชุดนอนซีด
  dread: ['atez', { t: null, y: '#c9cdd9', v: '#c9cdd9', p: '#dcdfe9', r: '#1a0a14', c: '#3a2149', g: '#5b3b72', n: '#f0f0f0', b: '#2a1a30' }],
  X: ['K', { r: '#e0b040', a: '#8a8a70' }],
  sealLit: ['S', { s: '#c89a28', S: '#ffd860' }],
  sealBroken: ['S', { s: '#241c24', S: '#3a303a' }],
};

// ธีมพื้นของแต่ละห้อง
export const THEME = { R0: 'wood', R1: 'carpet', R2a: 'wood', R2b: 'tiles', R3: 'wood', R4: 'wood', R5: 'stone', R6: 'stone' };

const SCALE = 2;

function bake(rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * SCALE;
  c.height = rows.length * SCALE;
  const x = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    const col = ch === '.' ? null : ch === 'k' ? K : pal[ch];
    if (col) { x.fillStyle = col; x.fillRect(i * SCALE, y * SCALE, SCALE, SCALE); }
  }));
  return c;
}

// ตัวขาวล้วนไว้กะพริบตอนโดนตี
export function flash(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

// วาดด้วยฟังก์ชัน f(x, y) → สี หรือ null ขนาด w×h pixel
function paint(w, h, f) {
  const c = document.createElement('canvas');
  c.width = w * SCALE; c.height = h * SCALE;
  const x = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    const col = f(i, y);
    if (col) { x.fillStyle = col; x.fillRect(i * SCALE, y * SCALE, SCALE, SCALE); }
  }
  return c;
}

const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

const FLOORS = {
  wood: (x, y, v) => (y % 4 === 3 ? '#3a2a1e' : (x + v * 5 + (y >> 2) * 7) % 16 === 0 ? '#3a2a1e' : hash(x + v * 16, y) < 0.06 ? '#56402e' : '#4a3426'),
  // พรมห้องเต้นรำ: น้ำเงินเข้มลายทอง (ไม่ใช้แดง เพราะชนกับช่องเตือนแดง)
  carpet: (x, y) => { const d = (Math.abs(x - 7.5) + Math.abs(y - 7.5)) | 0; return d === 6 ? '#9a7a3a' : d === 3 ? '#2a3658' : '#1c2440'; },
  tiles: (x, y) => (x % 8 === 0 || y % 8 === 0 ? '#5e584c' : ((x >> 3) + (y >> 3)) % 2 ? '#8a8070' : '#787060'),
  stone: (x, y, v) => (y % 8 === 0 || (x + (y >> 3) * 4 + v * 3) % 8 === 0 ? '#26262c' : hash(x + v * 16, y) < 0.1 ? '#44444c' : '#3a3a42'),
};
const WALLS = {
  house: (x, y) => (y < 3 ? '#2a1e2a' : y === 11 ? '#5a4030' : y > 11 ? '#3a2a22' : x % 4 === 0 ? '#2c2030' : '#34263a'),
  stone: (x, y) => (y % 5 === 0 || (x + (((y / 5) | 0) % 2) * 4) % 8 === 0 ? '#121216' : hash(x, y) < 0.1 ? '#2a2a32' : '#1f1f26'),
};

// ก้อนเนื้อโสมม 32×32 → 64×64: ก้อนเนื้อขรุขระ ตาเหลืองหลายดวง ปากกว้าง
function boss() {
  return paint(32, 32, (x, y) => {
    const dx = x - 15.5, dy = y - 17, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy), R = 13.5 + 1.5 * Math.sin(5 * a) + Math.sin(3 * a + 1);
    if (r > R) return null;
    if (r > R - 1.2) return K;
    if ((dx + 6) ** 2 + (dy + 6) ** 2 < 4 || (dx - 5) ** 2 + (dy + 7) ** 2 < 3 || (dx - 1) ** 2 + (dy + 10) ** 2 < 2) return '#f0d040';   // ตา
    if (dy > 3 && dy < 8 && Math.abs(dx) < 8 - (dy - 3)) return dy === 4 && x % 2 ? '#e8e0c8' : '#2a0a12';                       // ปาก + ฟัน
    return hash(x, y) < 0.15 ? '#4e6628' : hash(y, x) < 0.12 ? '#8aa04a' : '#6f8a3a';
  });
}

export function buildSprites() {
  const s = {};
  for (const [name, { rows, pal }] of Object.entries(ART)) s[name] = bake(rows, pal);
  for (const [name, [base, pal]] of Object.entries(VARIANTS)) s[name] = bake(ART[base].rows, { ...ART[base].pal, ...pal });
  for (const name of ['york', 'atez', 'dread', 'footman', 'maid', 'kinsman', 'kinswoman', 'brother', 'mother', 'maggot', 'pustule'])
    s[name + 'Flash'] = flash(s[name]);
  for (const [name, f] of Object.entries(FLOORS)) s['floor_' + name] = [0, 1, 2, 3].map(v => paint(16, 16, (x, y) => f(x, y, v)));
  for (const [name, f] of Object.entries(WALLS)) s['wall_' + name] = paint(16, 16, f);
  s.boss = boss();
  s.bossFlash = flash(s.boss);
  return s;
}
