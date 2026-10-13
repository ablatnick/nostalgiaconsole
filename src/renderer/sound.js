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

// Click: a very short filtered noise burst, for the soft "tick" of moving.
function click(start, freq, gain) {
  const c = audio();
  const t = c.currentTime + start;
  const len = Math.ceil(c.sampleRate * 0.03);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 2.5;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// Short, soft and airy, in the spirit of the 2008-2011 console sounds.
const SOUNDS = {
  move: () => { click(0, 3200, 0.5); tone(1900, 0, 0.035, { gain: 0.035, to: 1500 }); },
  channel: () => { whoosh(0, 0.24, 900, 3800, 0.075); click(0.01, 2400, 0.3); },
  select: () => { tone(620, 0, 0.09, { gain: 0.1, to: 880, type: 'sine' }); tone(1320, 0.07, 0.16, { gain: 0.07 }); },
  back: () => { tone(880, 0, 0.09, { gain: 0.09, to: 600 }); tone(990, 0.05, 0.12, { gain: 0.05, to: 700 }); },
  open: () => { whoosh(0, 0.3, 500, 4200, 0.06); tone(740, 0.02, 0.18, { gain: 0.06, type: 'triangle', to: 990 }); },
  close: () => { whoosh(0, 0.26, 4000, 600, 0.06); tone(880, 0, 0.12, { gain: 0.04, to: 620 }); },
  error: () => { tone(330, 0, 0.14, { gain: 0.1, type: 'triangle' }); tone(262, 0.11, 0.2, { gain: 0.09, type: 'triangle' }); },
  notify: () => {
    tone(988, 0, 0.12, { gain: 0.08, type: 'triangle' });
    tone(1319, 0.08, 0.16, { gain: 0.07, type: 'triangle' });
    tone(1976, 0.16, 0.42, { gain: 0.045 });
  },
  launch: () => {
    [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * 0.06, 0.5, { gain: 0.06, type: 'triangle' }));
    whoosh(0.05, 0.7, 400, 5000, 0.05);
  },
  intro: () => {
    whoosh(0, 1.6, 200, 4000, 0.07);
    [392, 523, 659, 784, 988].forEach((f, i) => tone(f, 0.25 + i * 0.12, 1.4, { gain: 0.06, type: 'sine', attack: 0.05 }));
    tone(196, 0.2, 2.2, { gain: 0.08, type: 'sine', attack: 0.3 });
  },
};

// Sound pack: files dropped into <user data>/sounds replace these.
const pack = new Map();
export async function loadPack(files) {
  pack.clear();
  for (const name of Object.keys(files || {})) {
    try {
      const res = await fetch('nostalgia://sounds/' + encodeURIComponent(name));
      if (!res.ok) continue;
      pack.set(name, await audio().decodeAudioData(await res.arrayBuffer()));
    } catch { /* unreadable file: keep the built-in sound */ }
  }
  return pack.size;
}

function playBuffer(buf) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(master);
  src.start();
}

export function play(name) {
  if (!enabled) return;
  try {
    if (pack.has(name)) playBuffer(pack.get(name));
    else if (SOUNDS[name]) SOUNDS[name]();
  } catch { /* audio unavailable */ }
}
