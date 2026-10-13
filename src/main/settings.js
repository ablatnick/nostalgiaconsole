'use strict';

const fs = require('fs');
const path = require('path');

const THEMES = ['classic', 'midnight', 'ember', 'arctic'];
const AFTER_LAUNCH = ['stay', 'minimize', 'close'];
// Customize: '' means "use the theme's own".
const TILE_COLORS = ['', 'lime', 'green', 'teal', 'blue', 'navy', 'purple', 'pink', 'red', 'orange', 'gold', 'slate', 'black'];
const BG_COLORS = ['', 'silver', 'graphite', 'black', 'navy', 'forest', 'plum', 'wine', 'sand'];
const TILE_SIZES = ['huge', 'large', 'medium', 'small', 'tiny'];
const TEXT_SIZES = ['small', 'normal', 'large'];
// Pivots that can be hidden (home and settings always stay).
// Dashboard styles (src/renderer/looks). 'metro' is the 2011 360 look.
const LOOKS = ['metro', 'nxe', 'blades', 'xmb', 'wii', 'ps5', 'switch', 'retro'];
const TABS = ['search', 'games', 'apps', 'video', 'streaming', 'social', 'steam'];
const COUNTS = { recentCount: [0, 3, 6, 9, 12], friendCount: [6, 12, 18, 24, 36] };
// Minutes of no input before the screensaver; 0 = off.
const SCREENSAVER = [0, 2, 5, 10, 20];
const DASH_SORTS = ['recent', 'az', 'played', 'size'];
const DASH_FILTERS = ['all', 'pinned', 'steam', 'shortcuts', 'played', 'unplayed'];
const PAD_ACTIONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'start', 'guide'];

const DEFAULTS = {
  theme: 'classic',
  look: 'metro',
  sound: true,
  volume: 60,
  intro: true,
  showTools: false,
  fullscreen: true,
  afterLaunch: 'stay',
  communityAvatar: true,
  moonlight: true,
  avatar: true,
  avatarLook: null,
  gamerpic: '',
  autostart: false,
  profiles: [],
  profile: '',
  jellyfinUser: '',
  gamertag: '',
  pinned: [],
  tileColor: '',
  bgColor: '',
  tileSize: 'large',
  textSize: 'normal',
  hiddenTabs: [],
  recentCount: 6,
  friendCount: 24,
  cycleTiles: true,
  screensaver: 5,
  friendAlerts: true,
  dashSort: 'recent',
  dashFilter: 'all',
  // Gamepad remapping: action -> standard-mapping button index.
  padMap: {},
  setupDone: false,
};

// What each profile keeps for itself.
const PROFILE_KEYS = ['gamertag', 'avatarLook', 'gamerpic', 'pinned', 'theme', 'tileColor', 'bgColor', 'look', 'jellyfinUser', 'dashSort', 'dashFilter'];

function sanitize(input) {
  const s = { ...DEFAULTS };
  if (!input || typeof input !== 'object') return s;
  if (THEMES.includes(input.theme)) s.theme = input.theme;
  if (LOOKS.includes(input.look)) s.look = input.look;
  for (const k of ['sound', 'intro', 'showTools', 'fullscreen', 'communityAvatar', 'moonlight', 'avatar', 'autostart', 'cycleTiles', 'friendAlerts', 'setupDone']) {
    if (typeof input[k] === 'boolean') s[k] = input[k];
  }
  if (Number.isFinite(input.volume)) s.volume = Math.max(0, Math.min(100, Math.round(input.volume)));
  // The renderer checks each value against the parts it offers.
  if (input.avatarLook && typeof input.avatarLook === 'object') {
    const look = {};
    for (const [k, v] of Object.entries(input.avatarLook).slice(0, 40)) {
      if (/^[a-zA-Z]{1,20}$/.test(k) && typeof v === 'string' && /^[#a-z0-9-]{1,16}$/i.test(v)) look[k] = v;
    }
    s.avatarLook = look;
  }
  if (TILE_COLORS.includes(input.tileColor)) s.tileColor = input.tileColor;
  if (BG_COLORS.includes(input.bgColor)) s.bgColor = input.bgColor;
  if (TILE_SIZES.includes(input.tileSize)) s.tileSize = input.tileSize;
  if (TEXT_SIZES.includes(input.textSize)) s.textSize = input.textSize;
  if (Array.isArray(input.hiddenTabs)) s.hiddenTabs = [...new Set(input.hiddenTabs.filter((t) => TABS.includes(t)))];
  for (const [k, list] of Object.entries(COUNTS)) if (list.includes(input[k])) s[k] = input[k];
  if (SCREENSAVER.includes(input.screensaver)) s.screensaver = input.screensaver;
  if (DASH_SORTS.includes(input.dashSort)) s.dashSort = input.dashSort;
  if (DASH_FILTERS.includes(input.dashFilter)) s.dashFilter = input.dashFilter;
  if (input.padMap && typeof input.padMap === 'object') {
    s.padMap = {};
    for (const a of PAD_ACTIONS) if (Number.isInteger(input.padMap[a]) && input.padMap[a] >= 0 && input.padMap[a] < 32) s.padMap[a] = input.padMap[a];
  }
  if (AFTER_LAUNCH.includes(input.afterLaunch)) s.afterLaunch = input.afterLaunch;
  if (typeof input.gamertag === 'string') s.gamertag = input.gamertag.slice(0, 32);
  if (typeof input.jellyfinUser === 'string') s.jellyfinUser = input.jellyfinUser.slice(0, 64);
  // '' = Steam picture when there is one, 'avatar' = avatar head, or a file
  // name from the gamerpics folder.
  if (typeof input.gamerpic === 'string' && (input.gamerpic === '' || input.gamerpic === 'avatar' || /^[\w .()-]{1,80}\.(png|jpe?g|webp|gif)$/i.test(input.gamerpic))) s.gamerpic = input.gamerpic;
  if (Array.isArray(input.pinned)) {
    s.pinned = [...new Set(input.pinned.filter((p) => typeof p === 'string' && /^(steam|shortcut):\d+$|^moonlight:[0-9A-Fa-f-]{8,64}:\d+$/.test(p)))].slice(0, 24);
  }
  if (Array.isArray(input.profiles)) {
    s.profiles = input.profiles.slice(0, 8).filter((p) => p && /^p\d{1,6}$/.test(p.id)).map((p) => {
      const clean = sanitize({ ...p, profiles: undefined });
      const out = { id: p.id, name: typeof p.name === 'string' ? p.name.slice(0, 32) : 'player' };
      for (const k of PROFILE_KEYS) out[k] = clean[k];
      return out;
    });
  }
  if (typeof input.profile === 'string' && s.profiles.some((p) => p.id === input.profile)) s.profile = input.profile;
  return s;
}

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* first run */ }
    // Settings from before the setup screen existed: already set up.
    if (raw && typeof raw === 'object' && raw.setupDone === undefined) raw.setupDone = true;
    this.values = sanitize(raw);
  }

  update(patch) {
    this.values = sanitize({ ...this.values, ...patch });
    // Keep the signed-in profile's copy in step.
    const cur = this.values.profiles.find((p) => p.id === this.values.profile);
    if (cur) for (const k of PROFILE_KEYS) cur[k] = this.values[k];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2));
    fs.renameSync(tmp, this.file);
    return this.values;
  }
}

// Profiles: the first one is created from the current settings the first
// time someone adds a profile.
Settings.prototype.createProfile = function createProfile(name) {
  const v = this.values;
  if (!v.profiles.length) {
    v.profiles.push({ id: 'p1', name: v.gamertag || 'player one', ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, v[k]])) });
    v.profile = 'p1';
  }
  const id = 'p' + (Math.max(0, ...v.profiles.map((p) => Number(p.id.slice(1)))) + 1);
  v.profiles.push({ id, name: String(name || 'player').slice(0, 32), gamertag: String(name || '').slice(0, 32), avatarLook: null, gamerpic: '', pinned: [], theme: v.theme, look: v.look, jellyfinUser: '', dashSort: 'recent', dashFilter: 'all' });
  return this.switchProfile(id);
};

Settings.prototype.switchProfile = function switchProfile(id) {
  const v = this.values;
  const next = v.profiles.find((p) => p.id === id);
  if (!next) return v;
  const patch = { profile: id };
  for (const k of PROFILE_KEYS) patch[k] = next[k];
  return this.update(patch);
};

Settings.prototype.removeProfile = function removeProfile(id) {
  const v = this.values;
  if (v.profiles.length < 2 || id === v.profile) return v;
  return this.update({ profiles: v.profiles.filter((p) => p.id !== id) });
};

module.exports = { Settings, sanitize, DEFAULTS, THEMES, AFTER_LAUNCH, TILE_COLORS, BG_COLORS, TILE_SIZES, TEXT_SIZES, TABS, COUNTS, LOOKS, SCREENSAVER, DASH_SORTS, DASH_FILTERS, PAD_ACTIONS };
