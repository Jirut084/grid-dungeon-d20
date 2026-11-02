# Grid Dungeon d20 (ชื่อชั่วคราว) — แพ็กข้อมูลโปรเจกต์

อัปเดตล่าสุด: 21 ต.ค. 2026 · ฉบับออนไลน์ที่แก้ไขได้: https://claude.ai/code/artifact/c69739c2-a3af-4e98-a593-bad152be9090

| โฟลเดอร์ / ไฟล์ | เนื้อหา |
| --- | --- |
| GDD/GDD-main.pdf / .md | GDD หลัก 16 หมวด: ภาพรวม core loop ระบบต่อสู้ ระบบ D&D ฮีโร่ Journal เควส เควสคู่และบทพูด 4 ฉากจบ AI คู่หู Unity บท 8 ตอนจบ บทส่งท้าย เสียง |
| GDD/GDD-MVP.pdf / .md | สเปก MVP คฤหาสน์ Umbra: ศัตรู บอส ห้อง อาวุธ Relic Feat ตัวเลขสมดุล UI/HUD asset list ทีมและ milestone (PDF มีภาพประกอบครบ ไฟล์ .md ไม่มีภาพ) |
| lore/world-and-character-lore.md | lore โลกและตัวละคร พร้อมตารางเทียบชื่อ Sword Coast → ชื่อในเกม |
| lore/narrative-design.md | narrative design: โครงเรื่อง 3 องก์ จังหวะอารมณ์ setup/payoff เสียง DM barks |
| tools/balance.py | สคริปต์ทดสอบสมดุล รัน `python3 balance.py` ถ้าค่าหลุดเป้าจะหยุด |
| tools/rooms/*.txt | room template 8 ห้อง (R0–R6) 1 ตัวอักษร = 1 ช่อง ความหมายตัวอักษรอยู่ใน GDD-MVP |
| game/ | ต้นแบบเกมบนเว็บ (HTML5 + JavaScript ไม่มี library) ทำก่อนแล้วค่อย port ไป Unity · `src/sim.js` ตรรกะล้วน · `src/data.js` ตัวเลขเกม · `strings.json` ข้อความไทย/อังกฤษ · `src/sprites.js` ภาพชั่วคราวแบบตัวอักษร (1 ตัว = 1 pixel แก้ใน text editor ได้) · อ่านห้องจาก tools/rooms โดยตรง |
| art/ | ภาพ concept ของทีม 7 ภาพ · `art/sprites/*.aseprite` ภาพตัวละครจริง (ชื่อไฟล์ = ชื่อ sprite ในเกม · 32×32 บอส 64×64 · tag `idle_down/up/side`, `walk_*` และถ้าวาดเพิ่ม `attack_*` `dodge_*` `hit_*` `down` `kneel` เกมใช้เอง) แก้แล้วรัน `sh tools/export-sprites.sh` → `game/sprites/sheet.png` เกมใช้ทับภาพชั่วคราวทีละตัว |
| team-sources/ | ไฟล์ต้นฉบับจากทีม: lore.pdf และชีต D&D 4 ตัว |

## เล่นต้นแบบ

รันจากโฟลเดอร์นี้ แล้วเปิด http://localhost:8123/game/

```bash
python -m http.server 8123
```

ทดสอบแบบไม่เปิดเบราว์เซอร์:
- `node game/test/sim.test.js` กฎหลัก
- `node game/test/bot.js` บอท AI เล่นแต่ละห้อง 100 รอบ (เกณฑ์ M2)
- `node game/test/run.js` บอทเล่นทั้ง run R0 → บอส → ฉากจบ ผ่านทั้งสองทาง แล้วสรุปตัววัดเทียบเป้า · เติม `--new` = จำลองผู้เล่นใหม่ที่พลาดหลบ 30%
- `node tools/feel.mjs grid-dungeon-runs.json [กราฟ.svg]` สรุปคะแนนอารมณ์ต่อห้องจาก log (กด T ในเกมเพื่อให้คะแนน) เทียบเส้นเป้าความตึงเครียด [เสนอ] และเตือนห้องหนักติดกัน

จบ run แล้วเกมแสดงตัววัดเทียบเป้าใน GDD-MVP และเก็บ log ทุก run ไว้ในเบราว์เซอร์ กด D เพื่อดาวน์โหลดเป็น JSON · Relic จากฉากจบติดตัวไป run ถัดไป

ปุ่ม: WASD/ลูกศร เดิน · J โจมตี · K/Space หลบ · U Vow (York) / Form of Dread (Atez) · I Smite (York) / กระดิ่ง (Atez) · O Grapple (York) / Bane (Atez) · F Stone's Endurance · P ลืมแผน (Feat) · E ใช้ของ หรือกดค้างเพื่อสวด ชุบ Lay on Hands · 1 ตามมา / 2 รอตรงนี้ / 3 โจมตีเป้านี้ · Q Journal · R ให้ DM เล่าห้องนี้ใหม่ · N เริ่ม run ใหม่ · Shift+1–8 วาร์ปไปห้อง R0–R6 (ทดสอบ) · M เปิด/ปิดเสียง · T เปิด/ปิดการให้คะแนนอารมณ์หลังเคลียร์ห้อง (ความตึงเครียด ความรู้สึกต่อคู่หู ความหงุดหงิด 1–5 + บันทึก 1 บรรทัด → `rooms[].feel` ใน log) · L ภาษา

## เสียง

ตอนนี้ใช้เสียงสังเคราะห์ชั่วคราว (`src/audio.js`) ส่วนเพลงยังเงียบ ใส่ไฟล์จริงได้ทีละชื่อ: วางไฟล์ใน `game/sounds/` แล้วเพิ่มลงใน `game/sounds/sounds.json` เช่น `{ "hit": "hit.ogg", "explore": "music/explore.ogg" }`

- เพลง 9 ชื่อ: `explore` `fight` `boss1` `boss2` `confront` `endA` `endB` `endC` `endD`
- SFX: `swing` `hit` `hurt` `crit` `dodge` `beam` `thud` `dust` `heal` `shield` `block` `bane` `save` `weapon` `dice` `diceStop` `nat20` `crack` `page` `card` `levelup` `type` `heart` · เสียงเตือนแยกท่า `warn_<ชื่อท่า>` เช่น `warn_tray` `warn_fan` `warn_breath` (ไม่มีไฟล์ = ใช้ `warn`) · ในหน้าต่างเลือกกดตัวเลขหรือคลิก

ยังรอ: ชื่อศิษย์น้อง สิงโตขาว สัตว์ตัวกลม (และชนิดสัตว์), ชื่อเกม, ที่เก็บโค้ด (git)
