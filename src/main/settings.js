'use strict';

const fs = require('fs');
const path = require('path');

const THEMES = ['classic', 'midnight', 'ember', 'arctic'];
const AFTER_LAUNCH = ['stay', 'minimize', 'close'];

const DEFAULTS = {
  theme: 'classic',
  sound: true,
  volume: 60,
  intro: true,
  showTools: false,
  fullscreen: true,
  afterLaunch: 'stay',
  communityAvatar: true,
  moonlight: true,
  gamertag: '',
  pinned: [],
};

function sanitize(input) {
  const s = { ...DEFAULTS };
  if (!input || typeof input !== 'object') return s;
  if (THEMES.includes(input.theme)) s.theme = input.theme;
  for (const k of ['sound', 'intro', 'showTools', 'fullscreen', 'communityAvatar', 'moonlight']) {
    if (typeof input[k] === 'boolean') s[k] = input[k];
  }
  if (Number.isFinite(input.volume)) s.volume = Math.max(0, Math.min(100, Math.round(input.volume)));
  if (AFTER_LAUNCH.includes(input.afterLaunch)) s.afterLaunch = input.afterLaunch;
  if (typeof input.gamertag === 'string') s.gamertag = input.gamertag.slice(0, 32);
  if (Array.isArray(input.pinned)) {
    s.pinned = [...new Set(input.pinned.filter((p) => typeof p === 'string' && /^(steam|shortcut):\d+$|^moonlight:[0-9A-Fa-f-]{8,64}:\d+$/.test(p)))].slice(0, 24);
  }
  return s;
}

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* first run */ }
    this.values = sanitize(raw);
  }

  update(patch) {
    this.values = sanitize({ ...this.values, ...patch });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2));
    fs.renameSync(tmp, this.file);
    return this.values;
  }
}

module.exports = { Settings, sanitize, DEFAULTS, THEMES, AFTER_LAUNCH };
