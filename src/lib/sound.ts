// أصوات قصيرة تُولَّد داخل المتصفح (Web Audio) دون ملفات خارجية، مع إمكانية الكتم
const KEY = 'nabd.sound';
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* التخزين غير متاح */ }
  if (on) unlockSound();
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) { try { ctx = new AC(); } catch { return null; } }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

// المتصفحات تمنع الصوت قبل أول لمسة؛ نفتحه عند أول تفاعل
export function unlockSound() { audio(); }
if (typeof window !== 'undefined') {
  const once = () => { unlockSound(); window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

interface Note { f: number; t: number; d: number; type?: OscillatorType; v?: number; to?: number }

function play(notes: Note[]) {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.01;
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = n.type ?? 'sine';
    o.frequency.setValueAtTime(n.f, t0 + n.t);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.t + n.d);
    const v = n.v ?? 0.18;
    g.gain.setValueAtTime(0.0001, t0 + n.t);
    g.gain.exponentialRampToValueAtTime(v, t0 + n.t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
    o.connect(g).connect(a.destination);
    o.start(t0 + n.t);
    o.stop(t0 + n.t + n.d + 0.05);
  }
}

export const sfx = {
  correct: () => play([{ f: 660, t: 0, d: 0.12, type: 'triangle' }, { f: 990, t: 0.1, d: 0.22, type: 'triangle' }]),
  wrong: () => play([{ f: 220, t: 0, d: 0.18, type: 'sawtooth', v: 0.09 }, { f: 160, t: 0.16, d: 0.3, type: 'sawtooth', v: 0.09 }]),
  coin: () => play([{ f: 988, t: 0, d: 0.08, type: 'square', v: 0.07 }, { f: 1319, t: 0.07, d: 0.25, type: 'square', v: 0.07 }]),
  sent: () => play([{ f: 520, t: 0, d: 0.1, type: 'sine', v: 0.12 }]),
  roll: () => play(Array.from({ length: 8 }, (_, i) => ({ f: 300 + ((i * 137) % 400), t: i * 0.06, d: 0.05, type: 'square' as OscillatorType, v: 0.05 }))),
  shield: () => play([{ f: 400, t: 0, d: 0.5, type: 'sine', to: 900, v: 0.14 }]),
  freeze: () => play([{ f: 1800, t: 0, d: 0.4, type: 'sine', to: 600, v: 0.1 }, { f: 2400, t: 0.05, d: 0.3, type: 'sine', to: 900, v: 0.06 }]),
  take: () => play([{ f: 300, t: 0, d: 0.15, type: 'triangle', to: 700 }, { f: 880, t: 0.15, d: 0.15, type: 'triangle' }]),
  lose: () => play([{ f: 500, t: 0, d: 0.35, type: 'triangle', to: 200, v: 0.14 }]),
  bomb: () => play([{ f: 180, t: 0, d: 0.6, type: 'sawtooth', to: 40, v: 0.2 }]),
  streak: () => play([523, 659, 784].map((f, i) => ({ f, t: i * 0.08, d: 0.15, type: 'triangle' as OscillatorType }))),
  win: () => play([523, 659, 784, 1047, 784, 1047].map((f, i) => ({ f, t: i * 0.13, d: i === 5 ? 0.6 : 0.16, type: 'triangle' as OscillatorType, v: 0.2 }))),
  start: () => play([{ f: 440, t: 0, d: 0.15 }, { f: 440, t: 0.3, d: 0.15 }, { f: 880, t: 0.6, d: 0.4, type: 'triangle' }]),
};
