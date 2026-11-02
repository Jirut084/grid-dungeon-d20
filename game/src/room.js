// อ่าน room template จาก tools/rooms/*.txt (1 ตัวอักษร = 1 ช่อง ความหมายตาม GDD-MVP "Room template")
// พิกัด: x ไปขวา, y ลงล่าง (แถวแรกของไฟล์ = y 0) — Unity กลับแกน y ตอน port

// ponytail: ยังเดาว่าเฟอร์นิเจอร์ไหนกั้นทาง/กั้นกระสุน ผู้ออกแบบแก้สองบรรทัดนี้ได้เลย
export const BLOCK_MOVE = '#DpTbh|KXLce';  // กำแพง ประตู (ปิด) เสา โต๊ะ ตู้/เตียง เตาไฟ ลูกกรง ศพ คันโยก หีบ วัตถุอีเวนต์
export const BLOCK_SHOT = '#Dp';           // GDD: เสาหินบังลำแสงได้ เฟอร์นิเจอร์เตี้ยไม่บัง

export function parseRoom(text) {
  const rows = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  const w = rows[0].length;
  if (rows.some(r => r.length !== w)) throw new Error('room rows have different widths');
  return { w, h: rows.length, rows };
}

export const charAt = (room, x, y) => room.rows[y]?.[x] ?? '#';

export function find(room, ch) {
  const out = [];
  room.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === ch) out.push({ x, y }); }));
  return out;
}
