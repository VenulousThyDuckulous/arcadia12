let ctx = null;
const KEY = 'arcadia:muted';
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* storage may be blocked */ }

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const sound = {
  get muted() { return muted; },
  set muted(next) {
    muted = !!next;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  },
  toggle() {
    sound.muted = !muted;
    return muted;
  },
  /**
   * Short blip. Accepts a frequency in Hz, or one of the named presets below.
   */
  tone(freq = 440, dur = 0.08, type = 'square', gain = 0.05) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    try {
      const osc = a.createOscillator();
      const amp = a.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t = a.currentTime;
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(amp).connect(a.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    } catch { /* audio is decoration */ }
  },
  sweep(from, to, dur = 0.18, type = 'sawtooth', gain = 0.045) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    try {
      const osc = a.createOscillator();
      const amp = a.createGain();
      osc.type = type;
      const t = a.currentTime;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(amp).connect(a.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    } catch { /* ignore */ }
  },
  good() { sound.tone(660, 0.07, 'triangle', 0.05); },
  bad() { sound.sweep(320, 90, 0.22, 'sawtooth', 0.05); },
  click() { sound.tone(420, 0.035, 'square', 0.03); },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sound.tone(f, 0.14, 'triangle', 0.05), i * 90));
  },
};
