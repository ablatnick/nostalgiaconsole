// Interface sounds, synthesized so the app ships no audio files.

let ctx = null;
let master = null;
let enabled = true;
let volume = 0.6;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function configure(opts) {
  enabled = opts.sound;
  volume = opts.volume / 100;
  if (master) master.gain.value = volume;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.2, to = null, attack = 0.005 } = {}) {
  const c = audio();
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function whoosh(start, dur, from, to, gain = 0.12) {
  const c = audio();
  const t = c.currentTime + start;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

const SOUNDS = {
  move: () => tone(1500, 0, 0.06, { gain: 0.07, to: 1300 }),
  channel: () => { whoosh(0, 0.28, 600, 2400, 0.1); tone(880, 0.02, 0.12, { gain: 0.05 }); },
  select: () => { tone(988, 0, 0.12, { gain: 0.12 }); tone(1480, 0.06, 0.2, { gain: 0.1 }); },
  back: () => { tone(1175, 0, 0.1, { gain: 0.1 }); tone(784, 0.06, 0.16, { gain: 0.08 }); },
  open: () => { whoosh(0, 0.35, 300, 3000, 0.08); tone(660, 0, 0.2, { gain: 0.08, type: 'triangle' }); tone(990, 0.08, 0.3, { gain: 0.07 }); },
  close: () => whoosh(0, 0.3, 2600, 400, 0.08),
  error: () => { tone(220, 0, 0.18, { gain: 0.12, type: 'triangle' }); tone(196, 0.12, 0.22, { gain: 0.1, type: 'triangle' }); },
  notify: () => {
    tone(784, 0, 0.18, { gain: 0.09, type: 'triangle' });
    tone(1175, 0.09, 0.28, { gain: 0.08, type: 'triangle' });
    tone(1568, 0.18, 0.5, { gain: 0.05 });
  },
  launch: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.6, { gain: 0.08, type: 'triangle' }));
    whoosh(0.1, 0.8, 400, 4000, 0.06);
  },
  intro: () => {
    whoosh(0, 1.4, 200, 3500, 0.07);
    [392, 523, 659, 784, 988].forEach((f, i) => tone(f, 0.25 + i * 0.12, 1.4, { gain: 0.06, type: 'sine', attack: 0.05 }));
    tone(196, 0.2, 2.2, { gain: 0.08, type: 'sine', attack: 0.3 });
  },
};

export function play(name) {
  if (!enabled || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch { /* audio unavailable */ }
}
