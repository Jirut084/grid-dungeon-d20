// กราฟอารมณ์จาก log ที่ผู้ออกแบบให้คะแนนหลังเคลียร์ห้อง (GDD-MVP "การทดสอบ")
// รัน: node tools/feel.mjs <grid-dungeon-runs.json> [ออก.svg] → ตารางค่าเฉลี่ยต่อห้อง + SVG เทียบเส้นเป้า
// เส้นเป้าความตึงเครียดเป็น [เสนอ] จากลำดับห้องใน GDD-MVP และกฎ "หนัก → เบา" ใน narrative-design หมวด 4 · ผู้ออกแบบแก้ได้ที่ TARGET
import { readFileSync, writeFileSync } from 'node:fs';

const ORDER = ['R0', 'R1', 'R2a', 'R2b', 'R3', 'R4', 'R5', 'R6'];
const TARGET = { R0: 2, R1: 4, R2a: 3, R2b: 3, R3: 2, R4: 4, R5: 2, R6: 5 };   // [เสนอ]
const KEYS = ['tension', 'bond', 'annoy'];

const [file, out] = process.argv.slice(2);
if (!file) { console.log('ใช้: node tools/feel.mjs <grid-dungeon-runs.json> [ออก.svg]'); process.exit(1); }
const runs = JSON.parse(readFileSync(file, 'utf8'));
const rated = runs.flatMap(r => (r.rooms ?? []).filter(x => x.feel).map(x => ({ ...x.feel, room: x.room, hero: r.hero })));
if (!rated.length) { console.log('ยังไม่มีคะแนน (เปิดด้วยปุ่ม T ในเกม แล้วให้คะแนนหลังเคลียร์ห้อง)'); process.exit(0); }

const avg = (room, k) => { const xs = rated.filter(x => x.room === room).map(x => x[k]); return xs.length ? xs.reduce((a, b) => a + b) / xs.length : null; };
const rows = ORDER.map(room => ({ room, n: rated.filter(x => x.room === room).length, target: TARGET[room],
  ...Object.fromEntries(KEYS.map(k => [k, avg(room, k)])) })).filter(r => r.n);
console.table(rows.map(r => ({ ...r, ...Object.fromEntries(KEYS.map(k => [k, r[k]?.toFixed(1)])) })));

// กฎหนัก → เบา: ตึงเครียด ≥ 4 สองห้องติดกัน · หงุดหงิดที่ไม่ได้ตั้งใจ ≥ 3 = ต้องดู
for (const r of runs) (r.rooms ?? []).forEach((x, i, rs) => {   // ห้องที่เล่นต่อกันจริงใน run เดียวกัน
  if (i && x.feel?.tension >= 4 && rs[i - 1].feel?.tension >= 4) console.log(`! ${rs[i - 1].room} → ${x.room} หนักติดกันสองห้อง (${r.hero})`);
});
for (const r of rows) if (r.annoy >= 3) console.log(`! ${r.room} หงุดหงิดที่ไม่ได้ตั้งใจ ${r.annoy.toFixed(1)}`);
for (const x of rated) if (x.note) console.log(`- ${x.room} (${x.hero}): ${x.note}`);

if (out) {
  const W = 480, H = 220, L = 30, B = 30, sx = i => L + (i * (W - L - 10)) / (rows.length - 1 || 1), sy = v => H - B - ((v - 1) * (H - B - 26)) / 4;
  const path = vals => vals.map((v, i) => (v == null ? '' : `${i && vals[i - 1] != null ? 'L' : 'M'}${sx(i)},${sy(v)}`)).join('');
  const lines = [['target', '#999', '4 3', rows.map(r => r.target)], ['tension', '#d64545', '', rows.map(r => r.tension)],
    ['bond', '#7fb0ff', '', rows.map(r => r.bond)], ['annoy', '#e0a030', '', rows.map(r => r.annoy)]];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" font-size="10">
<rect width="${W}" height="${H}" fill="#fff"/>
${[1, 2, 3, 4, 5].map(v => `<line x1="${L}" x2="${W - 10}" y1="${sy(v)}" y2="${sy(v)}" stroke="#eee"/><text x="${L - 12}" y="${sy(v) + 3}">${v}</text>`).join('')}
${rows.map((r, i) => `<text x="${sx(i) - 8}" y="${H - 12}">${r.room}</text>`).join('')}
${lines.map(([, c, dash, vals]) => `<path d="${path(vals)}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="${dash}"/>`).join('')}
${lines.map(([k, c], i) => `<text x="${L + i * 90}" y="12" fill="${c}">■ ${k}</text>`).join('')}
</svg>`;
  writeFileSync(out, svg);
  console.log('เขียนกราฟ →', out);
}
