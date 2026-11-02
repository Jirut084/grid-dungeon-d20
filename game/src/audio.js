// เสียง (GDD-MVP "Asset list · เสียง"): ไฟล์จริงประกาศใน sounds/sounds.json { "ชื่อ": "ไฟล์" } ทับเสียงสังเคราะห์ชั่วคราวทีละชื่อ
// แบบเดียวกับ sprite · SFX ที่ไม่มีไฟล์ = เสียงบี๊บจาก SYNTH · เพลงที่ไม่มีไฟล์ = เงียบ
// เบราว์เซอร์ไม่ให้เล่นเสียงก่อนผู้เล่นกดปุ่มแรก จึงเริ่ม AudioContext ใน unlock()

// [รูปคลื่น, ความถี่เริ่ม, ความถี่จบ, วินาที, ความดัง] · 'noise' = เสียงซ่า (ความถี่ = ตัวกรอง) · [เสนอ] ทั้งตาราง
const SYNTH = {
  swing: ['noise', 2400, 900, 0.07, 0.25], hit: ['square', 220, 90, 0.08, 0.2], hurt: ['sawtooth', 160, 60, 0.18, 0.3],
  crit: ['square', 660, 1320, 0.16, 0.25], dodge: ['noise', 600, 2400, 0.12, 0.2], beam: ['sawtooth', 900, 300, 0.14, 0.15],
  thud: ['triangle', 120, 40, 0.15, 0.4], dust: ['noise', 1200, 300, 0.3, 0.15], heal: ['sine', 520, 880, 0.25, 0.2],
  shield: ['triangle', 300, 600, 0.2, 0.25], block: ['square', 900, 900, 0.05, 0.15], bane: ['sine', 300, 150, 0.3, 0.2],
  save: ['triangle', 440, 440, 0.12, 0.25], weapon: ['noise', 3000, 1500, 0.04, 0.08], warn: ['sine', 880, 880, 0.05, 0.08],
  dice: ['noise', 800, 800, 0.6, 0.2], diceStop: ['triangle', 300, 200, 0.08, 0.35], nat20: ['square', 523, 1046, 0.45, 0.25],
  crack: ['noise', 400, 100, 0.35, 0.35], page: ['noise', 1800, 1000, 0.12, 0.15], card: ['triangle', 660, 990, 0.08, 0.2],
  levelup: ['square', 392, 784, 0.4, 0.2], type: ['square', 1400, 1400, 0.015, 0.04], heart: ['sine', 70, 55, 0.22, 0.5],
};

let ac, out, files = {}, muted = false, song = null;
const bufs = {};   // ชื่อ → AudioBuffer ที่โหลดแล้ว

export async function loadSounds() {
  try { muted = localStorage.getItem('muted') === '1'; } catch {}
  files = await fetch('sounds/sounds.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
}

export function unlock() {
  if (ac) return ac.resume();
  ac = new AudioContext();
  out = ac.createGain();
  out.gain.value = muted ? 0 : 1;
  out.connect(ac.destination);
  for (const [name, file] of Object.entries(files))
    fetch('sounds/' + file).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(b => { bufs[name] = b; if (song?.name === name) music(name, true); })
      .catch(e => console.warn('sound', name, e));
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('muted', muted ? '1' : '0'); } catch {}
  if (out) out.gain.value = muted ? 0 : 1;
  return muted;
}

// SFX: ชื่อเฉพาะ (เช่น warn_tray) ใช้ไฟล์ถ้ามี ไม่มีก็ใช้เสียงสังเคราะห์ของชื่อสำรอง (warn)
export function sfx(name, fallback) {
  if (!ac || ac.state !== 'running') return;
  const buf = bufs[name] ?? (fallback && bufs[fallback]);
  if (buf) { const s = ac.createBufferSource(); s.buffer = buf; s.connect(out); return s.start(); }
  const def = SYNTH[name] ?? SYNTH[fallback];
  if (def) synth(...def);
}

function synth(wave, f0, f1, dur, vol) {
  const t = ac.currentTime, amp = ac.createGain();
  amp.gain.setValueAtTime(vol, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
  amp.connect(out);
  let src;
  if (wave === 'noise') {
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src = ac.createBufferSource(); src.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f).connect(amp);
  } else {
    src = ac.createOscillator(); src.type = wave;
    src.frequency.setValueAtTime(f0, t); src.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(amp);
  }
  src.start(t); src.stop(t + dur);
}

// เพลงวนซ้ำ เปลี่ยนเพลงค่อยๆ จางข้ามกัน 1 วิ · ชื่อเพลงดู musicFor() ใน main.js
export function music(name, force) {
  if (!ac || (song?.name === name && !force)) return;
  if (song?.src) { song.amp.gain.setTargetAtTime(0, ac.currentTime, 0.3); song.src.stop(ac.currentTime + 1); }
  song = { name };
  if (!bufs[name]) return;
  const src = ac.createBufferSource(), amp = ac.createGain();
  src.buffer = bufs[name]; src.loop = true;
  amp.gain.setValueAtTime(0, ac.currentTime); amp.gain.setTargetAtTime(0.5, ac.currentTime, 0.3);
  src.connect(amp).connect(out); src.start();
  Object.assign(song, { src, amp });
}
