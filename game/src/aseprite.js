// ภาพจาก Aseprite (tools/export-sprites.sh → sprites/sheet.json + .png) ทับ asset ชั่วคราวทีละชื่อ · ไม่มี sheet = ใช้ของเดิม
import { flash } from './sprites.js';

export const ANIM = {};   // ANIM.york.idle_down = [{ c: canvas, ms }] · ไฟล์ที่ไม่มี tag อยู่ใต้ idle

export function loadAseprite(spr) {
  fetch('sprites/sheet.json').then(r => r.ok ? r.json() : null).then(async data => {
    if (!data) return;
    const img = new Image();
    img.src = 'sprites/' + data.meta.image;
    await img.decode();
    for (const { filename, frame: f, duration } of data.frames) {   // filename = "york#idle_down#0" · ไม่มี tag = "floor_wood##0"
      const [name, t, i] = filename.split('#'), tag = t || 'idle';   // ไฟล์ไม่มี tag = ท่า idle ทุกทิศ
      const c = document.createElement('canvas');
      c.width = f.w; c.height = f.h;
      c.getContext('2d').drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      ((ANIM[name] ??= {})[tag] ??= [])[i] = { c, ms: duration };
    }
    // ภาพนิ่ง = tag แรก · พื้นที่มีหลายแบบ = แต่ละเฟรมคือแต่ละแบบ
    for (const [name, tags] of Object.entries(ANIM)) {
      const list = Object.values(tags)[0].map(x => x.c);
      spr[name] = Array.isArray(spr[name]) ? spr[name].map((_, i) => list[i % list.length]) : list[0];
      if (spr[name + 'Flash']) spr[name + 'Flash'] = flash(spr[name]);
    }
  }).catch(e => console.warn('Aseprite sheet:', e));
  return spr;
}

// เฟรมของ tag ณ เวลา t (วินาที) ตาม duration ที่ตั้งใน Aseprite · ไม่มี tag นี้ = undefined
export function animFrame(name, tag, t) {
  const list = ANIM[name]?.[tag];
  if (!list) return;
  let ms = (t * 1000) % list.reduce((s, x) => s + x.ms, 0);
  for (const x of list) if ((ms -= x.ms) < 0) return x.c;
}
