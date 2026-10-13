import { startInput, setPadMap, buttonOf, captureButton, KEY_NAMES } from './input.js';
import * as sound from './sound.js';
import { icon } from './icons.js';
import { avatarSvg, PARTS, VIEW_HEAD, VIEW_FULL, normalizeLook, randomLook } from './avatar.js';
import { AvatarView, AvatarLineup, snapshot, webglAvailable } from './avatar3d.js';
import { LOOK_MODULES } from './looks/index.js';

// 3D avatars when WebGL works, the flat drawing otherwise (and in lite
// mode, which is read once at start-up).
const GL_OK = webglAvailable();
let GL = GL_OK;
const picCache = new Map();
function avatarPic(lk, view = 'head', size = 128, cls = 'gamerpic-av') {
  if (!GL) return avatarSvg(lk, { viewBox: view === 'head' ? VIEW_HEAD : VIEW_FULL, cls });
  const key = JSON.stringify([lk, view, size]);
  if (!picCache.has(key)) {
    if (picCache.size > 200) picCache.clear();
    picCache.set(key, snapshot(lk, { view, size }));
  }
  return `<img class="${cls}" alt="" src="${picCache.get(key)}">`;
}
let dashAvatar = null;

const api = window.nostalgia;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const THEMES = ['classic', 'midnight', 'ember', 'arctic'];
// Dashboard styles; settings.js has the same list.
const LOOK_NAMES = {
  metro: '360 metro (2011)', nxe: '360 nxe (2008)', blades: '360 blades (2005)', xmb: 'cross media bar',
  wii: 'channels', ps5: 'modern cards', switch: 'tile strip', retro: 'retro plus',
};
const AFTER_LAUNCH = ['stay', 'minimize', 'close'];
const VOLUMES = [20, 40, 60, 80, 100];
// Customize options; settings.js has the same lists. '' = the theme's own.
const TILE_HEX = {
  lime: '#7cc13a', green: '#2e9d3a', teal: '#14a3a0', blue: '#1f86cc', navy: '#2b4c9b', purple: '#7d4cc6',
  pink: '#d6469a', red: '#cc2f36', orange: '#e0711f', gold: '#d9a400', slate: '#5d6b75', black: '#24282b',
};
const BG_HEX = {
  silver: ['#8c969d', '#a3acb2', '#bfc6ca'], graphite: ['#3f4549', '#353a3e', '#2a2e31'], black: ['#141516', '#0c0d0e', '#050505'],
  navy: ['#1d2c4a', '#14203a', '#0b1326'], forest: ['#2b4a30', '#1f3623', '#132216'], plum: ['#46304f', '#33223a', '#211625'],
  wine: ['#561e28', '#3c141b', '#250b10'], sand: ['#a8946a', '#b8a57c', '#c9b892'],
};
const TILE_SIZES = { huge: 1.15, large: 1, medium: 0.85, small: 0.72, tiny: 0.6 };
const TEXT_SIZES = { small: 0.85, normal: 1, large: 1.2 };
const TAB_NAMES = { search: 'search', games: 'games', apps: 'apps', retro: 'retro (retroarch)', collections: 'collections', video: 'video (jellyfin)', streaming: 'streaming (moonlight)', social: 'social (friends)', steam: 'steam' };
const COUNTS = { recentCount: [0, 3, 6, 9, 12], friendCount: [6, 12, 18, 24, 36] };
// "show" filter for the games list in every style; settings.js has the keys.
const DASH_FILTERS = {
  all: ['everything', () => true],
  pinned: ['pinned', (g) => isPinned(g)],
  steam: ['steam games', (g) => g.kind === 'steam'],
  shortcuts: ['non-steam games', (g) => g.kind === 'shortcut'],
  played: ['played before', (g) => g.lastPlayed > 0],
  unplayed: ['never played', (g) => !g.lastPlayed],
};
const SCREENSAVER_MIN = [0, 2, 5, 10, 20];
const SORTS = [
  ['recent', 'recently played'],
  ['az', 'a–z'],
  ['played', 'most played'],
  ['size', 'size on disk'],
];

const state = {
  lib: null,
  settings: null,
  all: [],
  byId: new Map(),
  channels: [],
  ch: 0,
  focus: {},
  overlays: [],
  introUntil: 0,
};

// ---------- helpers ----------

const $ = (sel, el = document) => el.querySelector(sel);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function artUrl(item, kind) {
  if (item.kind === 'jf') {
    const type = kind === 'hero' || kind === 'header' ? (item.backdrop ? 'Backdrop' : 'Primary') : 'Primary';
    const id = type === 'Backdrop' ? item.backdropItem : kind === 'thumb' ? item.thumbItem : item.id;
    return `nostalgia://jf/Items/${id}/Images/${type}?maxHeight=${kind === 'hero' ? 1080 : 600}&quality=90`;
  }
  if (item.kind === 'moonlight') return `nostalgia://art/moonlight/${item.host}/${item.appid}`;
  return `nostalgia://art/${item.kind}/${item.appid}/${kind}`;
}

function timeAgo(sec) {
  if (!sec) return 'not played yet';
  const s = Math.max(0, Date.now() / 1000 - sec);
  if (s < 3600) return 'played just now';
  if (s < 86400) return `played ${Math.round(s / 3600)} hr ago`;
  const d = Math.round(s / 86400);
  if (d === 1) return 'played yesterday';
  if (d < 30) return `played ${d} days ago`;
  if (d < 365) return `played ${Math.round(d / 30)} mo ago`;
  return `played ${Math.round(d / 365)} yr ago`;
}

function hours(min) {
  if (!min) return '';
  const h = min / 60;
  return h < 1 ? `${min} min played` : `${h < 10 ? h.toFixed(1) : Math.round(h)} hrs played`;
}

function bytes(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

function gameSub(g) {
  if (g.downloading) return `downloading${g.progress != null ? ` · ${Math.round(g.progress * 100)}%` : ''}`;
  if (g.notInstalled) return 'not installed · press a to install';
  const parts = [timeAgo(g.lastPlayed)];
  if (g.playtime) parts.push(hours(g.playtime));
  if (g.needsUpdate) parts.push('update pending');
  return parts.join(' · ');
}

// Artwork with fallbacks. Wide art sits over a blurred copy of itself so
// any aspect ratio fills the tile without cropping the game's logo.
function artEl(item, kinds, { portrait = false, lazy = false } = {}) {
  const box = el('div', 'art');
  const blur = new Image();
  blur.className = 'blur';
  blur.alt = '';
  const fg = new Image();
  fg.className = 'fg';
  fg.alt = '';
  fg.decoding = 'async';
  if (lazy) { fg.loading = 'lazy'; blur.loading = 'lazy'; }
  let i = 0;
  const next = () => {
    if (i >= kinds.length) {
      box.classList.add('noart');
      blur.remove();
      fg.remove();
      box.append(el('div', 'noart-name', esc(item.name)));
      return;
    }
    const kind = kinds[i++];
    const cover = portrait && kind === 'portrait';
    box.classList.toggle('cover', cover);
    fg.src = artUrl(item, kind);
    if (cover) blur.removeAttribute('src');
    else blur.src = fg.src;
  };
  fg.onerror = next;
  box.append(blur, fg);
  next();
  return box;
}

// Console-style notification: a glowing ring pops up at the bottom and
// the message slides out of it.
function notify(title, msg, { img = null, ms = 3800, chime = true } = {}) {
  const t = $('#toast');
  t.classList.remove('show');
  void t.offsetWidth;
  const ring = img ? `<img alt="" src="${esc(img)}">` : '<img class="n-logo" alt="" src="logo.svg">';
  t.innerHTML = `<div class="n-ring">${ring}</div><div class="n-text"><small>${esc(title)}</small><b>${esc(msg)}</b></div>`;
  const pic = t.querySelector('img');
  if (pic) pic.onerror = () => { pic.replaceWith(document.createRange().createContextualFragment(icon('controller'))); };
  t.classList.add('show');
  if (chime) sound.play('notify');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => t.classList.remove('show'), ms);
}

function toast(msg) {
  notify('nostalgiaconsole', msg, { chime: false, ms: 2800 });
}

// ---------- data ----------

// Hidden games: the profile's own list plus Steam's hidden collection. A
// kid profile sees only the games a parent allowed.
function isHidden(g) {
  return state.settings.hidden.includes(g.id) || (g.kind === 'steam' && (state.lib.steamHidden || []).includes(g.appid));
}

function visible(g) {
  if (state.settings.kid) return state.settings.allowed.includes(g.id);
  return !isHidden(g);
}

function indexLibrary() {
  const { lib, settings } = state;
  const steamGames = lib.games.filter((g) => g.installed || g.downloading)
    .concat(settings.showTools ? lib.tools.filter((t) => t.installed) : []);
  const everything = steamGames.concat(lib.shortcuts, lib.retro || []);
  state.hiddenGames = everything.filter((g) => isHidden(g));
  state.everything = everything;
  state.steamGames = steamGames.filter(visible);
  state.retro = (lib.retro || []).filter(visible);
  state.shortcuts = lib.shortcuts.filter(visible);
  state.all = state.steamGames.concat(state.shortcuts, state.retro);
  const ml = lib.moonlight || { hosts: [] };
  state.streams = settings.moonlight ? ml.hosts.flatMap((h) => h.apps.map((a) => ({
    id: `moonlight:${h.uuid}:${a.id}`, kind: 'moonlight', host: h.uuid, hostName: h.name, online: h.online,
    appid: a.id, name: a.name, boxart: a.boxart, lastPlayed: 0, playtime: 0,
  }))) : [];
  if (settings.kid) state.streams = state.streams.filter(visible);
  state.byId = new Map(state.all.concat(state.streams).map((g) => [g.id, g]));
}

function byRecent(a, b) {
  return (b.lastPlayed - a.lastPlayed) || a.name.localeCompare(b.name);
}

function sorted(list, sort) {
  const l = [...list];
  if (sort === 'az') l.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  else if (sort === 'played') l.sort((a, b) => (b.playtime - a.playtime) || byRecent(a, b));
  else if (sort === 'size') l.sort((a, b) => ((b.size || 0) - (a.size || 0)) || a.name.localeCompare(b.name));
  else l.sort(byRecent);
  return l;
}

function isPinned(g) {
  return state.settings.pinned.includes(g.id);
}

function gameTile(g, extra = {}) {
  return { key: g.id, type: 'game', game: g, title: g.name, sub: gameSub(g), ...extra };
}

function streamSub(g) {
  return `stream from ${g.hostName}${g.online === false ? ' · host offline' : ''}`;
}

function streamTile(g) {
  const ico = /big ?picture/i.test(g.name) ? 'bigpicture' : /desktop/i.test(g.name) ? 'monitor' : 'stream';
  return { key: g.id, type: 'stream', game: g, title: g.name, sub: streamSub(g), icon: ico, colors: ['#3b4f9e', '#1b2457'] };
}

function streamingChannel() {
  const ml = state.lib.moonlight;
  if (!state.settings.moonlight || !ml || (!ml.installed && !ml.hosts.length)) return null;
  const tiles = state.streams.map(streamTile);
  if (ml.installed) {
    tiles.push({
      key: 'ml:open', type: 'icon', icon: 'stream', label: 'moonlight', value: ml.hosts.length ? `${ml.hosts.length} host${ml.hosts.length === 1 ? '' : 's'} paired` : 'pair a host',
      title: 'moonlight', sub: 'open moonlight to pair hosts or change stream settings', colors: ['#4b3fa0', '#221a5c'],
      activate: () => api.openMoonlight(),
    }, {
      key: 'ml:refresh', type: 'icon', icon: 'refresh', label: 'refresh hosts', value: '',
      title: 'refresh hosts', sub: 'ask each paired host for its current apps', colors: ['#356b9e', '#173a5c'],
      activate: async () => {
        toast('checking hosts…');
        state.lib = await api.refreshMoonlight();
        rebuild();
        const on = state.lib.moonlight.hosts.filter((h) => h.online).length;
        toast(`${on} of ${state.lib.moonlight.hosts.length} hosts online`);
      },
    });
  }
  if (ml.installed && !state.settings.kid) {
    tiles.push({
      key: 'ml:pair', type: 'icon', icon: 'friends', label: 'pair a pc', value: 'enter a pin in sunshine', title: 'pair a pc',
      sub: 'add another computer running sunshine', colors: ['#2a7f6f', '#124038'], activate: () => openPair(),
    }, {
      key: 'ml:wake', type: 'icon', icon: 'power', label: 'wake on lan', value: state.settings.wakeBeforeStream ? 'wakes the pc first' : 'off', title: 'wake on lan',
      sub: 'turn a sleeping pc on before streaming', colors: ['#5a4f9e', '#2a2360'], activate: () => openWakeSetup(),
    });
  }
  return { key: 'streaming', title: 'streaming', tiles };
}

function libraryTile() {
  const n = state.all.length;
  return {
    key: 'library', type: 'icon', icon: 'grid', label: 'game library', value: `${n} game${n === 1 ? '' : 's'}`,
    title: 'game library', sub: 'every installed game and shortcut', colors: ['#5aa51e', '#2f6f0c'],
    activate: () => openLibrary(),
  };
}

function settingTiles() {
  const s = state.settings;
  const onoff = (v) => (v ? 'on' : 'off');
  if (s.kid) {
    return [
      { key: 'set:profiles', type: 'icon', icon: 'friends', label: 'switch profile', value: '', title: 'profiles', activate: () => openSignIn() },
      { key: 'set:avatar-edit', type: 'avatar', label: 'my avatar', value: 'customize', title: 'my avatar', activate: () => openAvatarEditor() },
      { key: 'set:family', type: 'icon', icon: 'user', label: 'family', value: 'grown-ups only', title: 'family', colors: ['#2e9d6a', '#155036'], activate: () => openFamily() },
    ];
  }
  const set = (patch, msg) => async () => {
    state.settings = await api.setSettings(patch);
    applySettings();
    rebuild();
    if (msg) toast(msg);
  };
  const next = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  return [
    { key: 'set:theme', type: 'icon', icon: 'palette', label: 'theme', value: s.theme, title: 'theme', sub: 'change the dashboard colors', colors: ['#7d58c6', '#46297f'], activate: set({ theme: next(THEMES, s.theme) }) },
    { key: 'set:customize', type: 'icon', icon: 'grid', label: 'customize', value: 'colors, tabs, tile size', title: 'customize', sub: 'tile and background colors, which tabs show, how big the tiles are', colors: ['#d6469a', '#8a1f5c'], activate: () => openCustomize() },
    { key: 'set:controls', type: 'icon', icon: 'controller', label: 'controls', value: Object.keys(s.padMap || {}).length ? 'remapped' : 'help and remapping', title: 'controls', sub: 'what every button does, and remap your controller', colors: ['#3d7f2a', '#1f4a14'], activate: () => openControls() },
    { key: 'set:avatar-edit', type: 'avatar', label: 'my avatar', value: 'customize', title: 'my avatar', sub: 'change your avatar\'s features and style', activate: () => openAvatarEditor() },
    { key: 'set:sound', type: 'icon', icon: s.sound ? 'sound' : 'mute', label: 'sounds', value: onoff(s.sound), title: 'interface sounds', sub: 'blips and swooshes while you browse', colors: ['#2c8fd6', '#155988'], activate: set({ sound: !s.sound }) },
    { key: 'set:pack', type: 'icon', icon: 'sound', label: 'sound pack', value: state.packCount ? `${state.packCount} custom sounds` : 'built-in sounds', title: 'sound pack',
      activate: async () => {
        const dir = await api.soundFolder();
        state.packCount = await sound.loadPack(await api.soundPack());
        rebuild();
        toast(state.packCount ? `loaded ${state.packCount} sounds from ${dir}` : `put move.wav, select.wav, back.wav… in ${dir}`);
      } },
    { key: 'set:steamweb', type: 'icon', icon: 'friends', label: 'steam web api', value: state.keys && state.keys.steam ? 'connected' : 'optional', title: 'steam web api',
      activate: async () => {
        const v = await openKeyboard({ title: 'steam web api key (optional)', secret: true, hint: 'gamerscore and friends already work without one; a key from steamcommunity.com/dev/apikey adds games you own but haven\'t installed, live friend status and achievements from other PCs' });
        if (v === null) return;
        state.keys = await api.setKeys({ steamApiKey: v });
        toast(v ? 'checking your steam account…' : 'steam web api key removed');
        rebuild();
      } },
    { key: 'set:jellyfin', type: 'icon', icon: 'bigpicture', label: 'jellyfin', value: state.keys && state.keys.jellyfin ? 'connected' : 'connect a server', title: 'jellyfin',
      activate: async () => {
        const url = await openKeyboard({ title: 'jellyfin server address', value: (state.keys && state.keys.jellyfinUrl) || 'http://', hint: 'for example http://192.168.1.10:8096' });
        if (url === null) return;
        const key = await openKeyboard({ title: 'jellyfin api key', secret: true, hint: 'jellyfin dashboard > api keys > +' });
        if (key === null) return;
        state.keys = await api.setKeys({ jellyfinUrl: url, jellyfinKey: key });
        state.video = null;
        await loadVideo();
        rebuild();
      } },
    ...(state.keys && state.keys.jellyfin ? [{ key: 'set:jfuser', type: 'icon', icon: 'user', label: 'jellyfin user', value: s.jellyfinUser || 'first admin', title: 'jellyfin user', sub: 'whose watch history and resume points this profile uses', colors: ['#2b6fd0', '#173f7a'],
      activate: async () => {
        const users = await api.jfUsers();
        if (!users.length) { toast('could not reach jellyfin'); return; }
        const names = ['', ...users.map((u) => u.name)];
        const at = names.findIndex((n) => n.toLowerCase() === (s.jellyfinUser || '').toLowerCase());
        const pick = names[(at + 1) % names.length];
        await set({ jellyfinUser: pick }, `jellyfin user: ${pick || 'first admin'}`)();
        state.video = null;
        await loadVideo();
        rebuild();
      } }] : []),
    { key: 'set:profiles', type: 'icon', icon: 'friends', label: 'profiles', value: `${Math.max(1, s.profiles.length)} profile${s.profiles.length > 1 ? 's' : ''}`, title: 'profiles', activate: () => openSignIn() },
    { key: 'set:autostart', type: 'icon', icon: 'power', label: 'start at login', value: onoff(s.autostart), title: 'start at login', activate: set({ autostart: !s.autostart }) },
    { key: 'set:update', type: 'icon', icon: 'refresh', label: 'check for updates', value: '', title: 'updates',
      activate: async () => {
        const u = await api.checkUpdate();
        if (u) offerUpdate(u); else toast('you have the latest version');
      } },
    { key: 'set:music', type: 'icon', icon: 'sound', label: 'background music', value: s.music ? `on · ${s.musicVolume}%` : 'off', title: 'background music', sub: 'your own music, quietly behind the dashboard; it fades out for games and videos', colors: ['#c4517a', '#7a2347'],
      activate: async () => {
        if (!s.music && !(await api.musicList()).length) {
          const dir = await api.musicFolder();
          toast(`put some .mp3 / .ogg / .flac files in ${dir}, then turn this on`);
          return;
        }
        await set({ music: !s.music })();
      } },
    { key: 'set:musicvol', type: 'icon', icon: 'volume', label: 'music volume', value: `${s.musicVolume}%`, title: 'music volume', colors: ['#9a3f63', '#5c1f39'], activate: set({ musicVolume: [10, 20, 30, 50, 70, 100][([10, 20, 30, 50, 70, 100].indexOf(s.musicVolume) + 1) % 6] }) },
    { key: 'set:musicdir', type: 'icon', icon: 'library', label: 'music folder', value: '', title: 'music folder', sub: 'opens the folder the music plays from', colors: ['#7a3f63', '#45213a'], activate: async () => toast(`music folder: ${await api.musicFolder()}`) },
    { key: 'set:hidden', type: 'icon', icon: 'mute', label: 'hidden games', value: `${state.hiddenGames.length} hidden`, title: 'hidden games', sub: 'games you hid (or hid in steam); open one to show it again', colors: ['#5d6b75', '#2f383e'],
      activate: () => (state.hiddenGames.length ? openLibrary({ title: 'hidden games', list: state.hiddenGames, sort: 1 }) : toast('nothing is hidden · hide a game from its details')) },
    { key: 'set:family', type: 'icon', icon: 'user', label: 'family', value: s.kid ? 'kid profile' : 'kid profiles, pin', title: 'family', sub: 'kid profiles that only see the games you allow, and a parent pin', colors: ['#2e9d6a', '#155036'], activate: () => openFamily() },
    { key: 'set:wakestream', type: 'icon', icon: 'power', label: 'wake before streaming', value: onoff(s.wakeBeforeStream), title: 'wake before streaming', sub: 'send wake-on-lan to a sleeping pc and wait for it before streaming', colors: ['#5a4f9e', '#2a2360'], activate: set({ wakeBeforeStream: !s.wakeBeforeStream }) },
    { key: 'set:motion', type: 'icon', icon: 'sparkle', label: 'reduce motion', value: onoff(s.reduceMotion), title: 'reduce motion', sub: 'no sliding, zooming or drifting; changes happen at once', colors: ['#3f6f8f', '#1f3d52'], activate: set({ reduceMotion: !s.reduceMotion }) },
    { key: 'set:contrast', type: 'icon', icon: 'palette', label: 'high contrast', value: onoff(s.highContrast), title: 'high contrast', sub: 'stronger outlines and text', colors: ['#222', '#000'], activate: set({ highContrast: !s.highContrast }) },
    { key: 'set:lite', type: 'icon', icon: 'rocket', label: 'lite mode', value: onoff(s.lite), title: 'lite mode', sub: 'for steam deck and slower pcs: flat avatars, no blur or drifting effects (avatars change on the next start)', colors: ['#4c7a2a', '#28431a'], activate: set({ lite: !s.lite }) },
    { key: 'set:volume', type: 'icon', icon: 'volume', label: 'volume', value: `${s.volume}%`, title: 'sound volume', sub: 'loudness of the interface sounds', colors: ['#1aa3a3', '#0d6464'], activate: set({ volume: VOLUMES[(VOLUMES.indexOf(s.volume) + 1) % VOLUMES.length] || 60 }) },
    { key: 'set:intro', type: 'icon', icon: 'sparkle', label: 'startup intro', value: onoff(s.intro), title: 'startup intro', sub: 'play the boot animation when nostalgiaconsole opens', colors: ['#d9a400', '#8d6900'], activate: set({ intro: !s.intro }) },
    { key: 'set:screensaver', type: 'icon', icon: 'image', label: 'screensaver', value: s.screensaver ? `after ${s.screensaver} min` : 'off', title: 'screensaver', sub: 'your game art drifts by when nobody has pressed anything (saves a tv from burn-in)', colors: ['#2a4f7a', '#13283f'], activate: set({ screensaver: next(SCREENSAVER_MIN, s.screensaver) }) },
    { key: 'set:friendalerts', type: 'icon', icon: 'friends', label: 'friend alerts', value: onoff(s.friendAlerts), title: 'friend alerts', sub: 'a pop-up when a friend comes online or starts a game', colors: ['#f08a00', '#9a5400'], activate: set({ friendAlerts: !s.friendAlerts }) },
    { key: 'set:fullscreen', type: 'icon', icon: 'fullscreen', label: 'full screen', value: onoff(s.fullscreen), title: 'full screen', sub: 'start in full screen (F11 switches any time)', colors: ['#4c6b80', '#28404f'],
      activate: async () => {
        const fs = await api.toggleFullscreen();
        await set({ fullscreen: fs })();
      } },
    { key: 'set:after', type: 'icon', icon: 'rocket', label: 'after launch', value: s.afterLaunch, title: 'after a game starts', sub: 'stay open, minimize, or close nostalgiaconsole', colors: ['#e0632a', '#93330b'], activate: set({ afterLaunch: next(AFTER_LAUNCH, s.afterLaunch) }) },
    { key: 'set:tools', type: 'icon', icon: 'wrench', label: 'steam tools', value: s.showTools ? 'shown' : 'hidden', title: 'steam tools', sub: `proton, runtimes and redistributables (${state.lib.tools.length} installed)`, colors: ['#6d7a84', '#3d474e'], activate: set({ showTools: !s.showTools }) },
    { key: 'set:moonlight', type: 'icon', icon: 'stream', label: 'moonlight', value: onoff(s.moonlight), title: 'moonlight streaming', sub: (state.lib.moonlight && state.lib.moonlight.installed) ? 'show apps from your paired moonlight hosts' : 'moonlight is not installed on this device', colors: ['#4b3fa0', '#221a5c'], activate: set({ moonlight: !s.moonlight }) },
    { key: 'set:gamerpic', type: 'icon', icon: 'image', label: 'gamerpic', value: s.gamerpic ? (s.gamerpic === 'avatar' ? 'my avatar' : 'picture') : 'steam picture', title: 'gamerpic', activate: () => openGamerpics() },
    { key: 'set:avatar', type: 'icon', icon: 'user', label: 'profile picture', value: onoff(s.communityAvatar), title: 'profile picture', sub: 'use your steam community avatar (public profiles)', colors: ['#3a9d55', '#1d5e2f'], activate: set({ communityAvatar: !s.communityAvatar }) },
    { key: 'set:refresh', type: 'icon', icon: 'refresh', label: 'refresh library', value: '', title: 'refresh library', sub: state.lib.root ? `reading ${state.lib.root}` : 'steam folder not found', colors: ['#5aa51e', '#2f6f0c'],
      activate: async () => {
        state.lib = await api.refreshLibrary();
        rebuild();
        toast(`library refreshed · ${state.all.length} games`);
      } },
    { key: 'set:setup', type: 'icon', icon: 'sparkle', label: 'run setup again', value: '', title: 'setup', sub: 'the first-run walkthrough: style, colors, name and avatar', colors: ['#7d58c6', '#46297f'], activate: () => openSetup() },
    { key: 'set:quit', type: 'icon', icon: 'power', label: 'quit', value: '', title: 'quit nostalgiaconsole', sub: state.lib.steamDeck ? 'back to steam' : 'close the dashboard', colors: ['#c4282d', '#7a1115'], activate: () => api.quit() },
  ];
}

function steamTiles() {
  const u = state.lib.user;
  const tiles = [];
  if (u) {
    tiles.push({
      key: 'steam:profile', type: 'profile', title: displayName(), sub: 'change your gamerpic',
      activate: () => openGamerpics(),
    });
  }
  const t = (key, ico, label, sub, colors, action) => ({ key: 'steam:' + key, type: 'icon', icon: ico, label, value: '', title: label, sub, colors, activate: () => openSteam(action) });
  // Downloads in progress: their progress here; the tile opens Steam's own
  // downloads page when nothing is downloading.
  const dl = downloads();
  tiles.push(
    t('store', 'store', 'store', 'browse the steam store', ['#1b6fb5', '#0b3a66'], 'storefront'),
    t('friends', 'friends', 'friends', 'friends and chat', ['#2a9c6c', '#11573a'], 'friends'),
    dl.length
      ? { key: 'steam:downloads', type: 'icon', icon: 'downloads', label: 'downloads', value: `${dl.length} downloading`, title: 'downloads', sub: dl.map((g) => `${g.name} ${gameSub(g).replace('downloading · ', '')}`).join(', '), colors: ['#5b6bd0', '#2c367d'], activate: () => openDownloads() }
      : t('downloads', 'downloads', 'downloads', 'installs and updates in progress', ['#5b6bd0', '#2c367d'], 'downloads'),
    t('library', 'library', 'steam library', 'open the full steam library', ['#4e5f6c', '#27323a'], 'library'),
    t('bigpicture', 'bigpicture', 'big picture', 'switch to steam big picture mode', ['#2f3c45', '#11181d'], 'bigpicture'),
    t('settings', 'gear', 'steam settings', 'steam client settings', ['#6c7880', '#394146'], 'settings'),
  );
  return tiles;
}

// ---------- pivots (the Metro-style dashboard) ----------
// Each pivot is a grid three tiles tall. Tiles have a column/row and a
// size in grid units; pivots sit side by side and scroll horizontally.

const ROWS = 3;

// Column-major flow: fill each column top to bottom, big tiles first fit.
function flow(tiles, startCol = 0) {
  const used = new Set();
  const free = (c, r, w, h) => {
    if (r + h > ROWS) return false;
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (used.has((c + i) + ':' + (r + j))) return false;
    return true;
  };
  for (const t of tiles) {
    const w = t.w || 1;
    const h = t.h || 1;
    for (let c = startCol; ; c++) {
      let placed = false;
      for (let r = 0; r < ROWS; r++) {
        if (free(c, r, w, h)) {
          Object.assign(t, { c, r, w, h });
          for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) used.add((c + i) + ':' + (r + j));
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }
  return tiles;
}

function pinsTile() {
  const n = state.settings.pinned.length;
  return { key: 'pins', type: 'icon', icon: 'pin', label: 'my pins', value: n ? `${n} pinned` : 'press y on a game to pin it', title: 'my pins',
    activate: () => openLibrary({ title: 'my pins', filter: (g) => isPinned(g) }) };
}

function recentTile() {
  return { key: 'recent', type: 'icon', icon: 'clock', label: 'recent', value: '', title: 'recent',
    activate: () => openLibrary({ title: 'recent', filter: (g) => g.lastPlayed > 0, sort: 0 }) };
}

function avatarTile() {
  return { key: 'avatar', type: 'avatar', label: 'my avatar', value: 'change your look', title: 'my avatar', activate: () => openAvatarEditor() };
}

function homePivot() {
  const recent = state.all.filter((g) => g.lastPlayed > 0).sort(byRecent);
  const pinned = state.settings.pinned.map((id) => state.byId.get(id)).filter(Boolean);
  const pool = [...new Set(recent.concat(pinned, sorted(state.all, 'az')))];
  const [hero, a, b] = [pool[0], pool[1], pool[2]];
  const tiles = [];
  const at = (t, c, r, w = 1, h = 1) => tiles.push(Object.assign(t, { c, r, w, h }));
  // The hero already says "continue" for a game; this tile plays it (or
  // resumes a video watched more recently).
  const resume = resumeTile();
  if (resume && resume.game.kind !== 'jf') resume.caption = `play ${resume.game.name}`;
  if (resume) at(resume, 0, 0);
  else at({ key: 'empty', type: 'icon', icon: 'controller', label: 'no games yet', value: state.lib.root ? 'install a game in steam' : 'steam was not found', title: 'no games', activate: () => openSteam('storefront') }, 0, 0);
  at(pinsTile(), 0, 1);
  at(recentTile(), 0, 2);
  if (hero) at(gameTile(hero, { hero: true, caption: hero.lastPlayed ? `continue ${hero.name}` : hero.name }), 1, 0, 2, 2);
  else at(libraryTile(), 1, 0, 2, 2);
  // The two tiles under the hero cycle through the rest of the library.
  const rest = pool.slice(1);
  if (a) at(gameTile(a, { cycle: { list: rest, slot: 0 } }), 1, 2);
  if (b) at(gameTile(b, { cycle: { list: rest, slot: 1 } }), 2, 2);
  at(libraryTile(), 3, 0);
  const stream = state.streams[0];
  if (stream) at(streamTile(stream), 3, 1);
  else if (state.settings.kid) at({ key: 'home:search', type: 'icon', icon: 'search', label: 'search', value: 'find a game', title: 'search', activate: () => searchGames() }, 3, 1);
  else at({ key: 'home:store', type: 'icon', icon: 'store', label: 'store', value: 'steam store', title: 'store', activate: () => openSteam('storefront') }, 3, 1);
  at(avatarTile(), 3, 2);
  return { key: 'home', title: 'home', tiles };
}

function buildChannels() {
  indexLibrary();
  const hidden = new Set(state.settings.hiddenTabs || []);
  return buildPivots().filter((pv) => !hidden.has(pv.key));
}

function buildPivots() {
  const { lib } = state;
  const pivots = [{ key: 'search', title: 'search', tiles: flow([
    { key: 'search:find', type: 'icon', icon: 'search', label: 'search games', value: 'type a name', title: 'search', w: 1, h: 1, cls: 'grey', activate: () => searchGames() },
    { key: 'search:az', type: 'icon', icon: 'grid', label: 'a–z', value: 'every game', title: 'a–z', w: 1, h: 1, cls: 'grey', activate: () => openLibrary({ title: 'a–z', sort: 1 }) },
  ]) }, homePivot()];
  if (state.steamGames.length) {
    const lt = libraryTile();
    lt.w = 2; lt.h = 2;
    // Just a few recent games; the library tile has the rest.
    const extra = [];
    const missing = state.settings.kid ? [] : notInstalled();
    if (missing.length) {
      extra.push({ key: 'games:notinstalled', type: 'icon', icon: 'downloads', label: 'not installed', value: `${missing.length} games you own`, title: 'not installed',
        activate: () => openLibrary({ title: 'not installed', list: missing, sort: 1 }) });
    }
    pivots.push({ key: 'games', title: 'games', tiles: flow([lt, ...sorted(state.steamGames, 'recent').slice(0, state.settings.recentCount ?? 6).map((g) => gameTile(g)), ...extra]) });
  }
  if (state.shortcuts.length) pivots.push({ key: 'apps', title: 'apps', tiles: flow(sorted(state.shortcuts, 'recent').map((g) => gameTile(g))) });
  const retro = retroPivot();
  if (retro) pivots.push(retro);
  const cols = collectionsPivot();
  if (cols) pivots.push(cols);
  const video = videoPivot();
  if (video) pivots.push(video);
  const streaming = streamingChannel();
  if (streaming) {
    if (streaming.tiles[0] && streaming.tiles[0].type === 'stream') { streaming.tiles[0].w = 2; streaming.tiles[0].h = 2; }
    pivots.push({ ...streaming, tiles: flow(streaming.tiles) });
  }
  const st = steamTiles();
  if (st[0] && st[0].type === 'profile') { st[0].w = 2; st[0].h = 2; }
  if (!state.settings.kid) pivots.push({ key: 'steam', title: 'steam', tiles: flow(st) });
  const friends = friendTiles();
  if (friends.length) {
    // A compact friends list: slim rows (picture + name), six per column.
    const perCol = ROWS * 2;
    const tiles = friends.map((t, i) => Object.assign(t, { c: Math.floor(i / perCol) * 1.5, r: (i % perCol) / 2, w: 1.5, h: 0.5 }));
    pivots.splice(pivots.length - 1, 0, { key: 'social', title: 'social', tiles });
  }
  pivots.push({ key: 'settings', title: 'settings', tiles: flow(settingTiles()) });
  return pivots;
}

// RetroArch: the most recent games, then one tile per system.
function retroPivot() {
  if (!state.retro.length) return null;
  const systems = [...new Set(state.retro.map((g) => g.system))];
  const tiles = sorted(state.retro, 'recent').slice(0, 6).map((g) => gameTile(g));
  for (const sys of systems) {
    const list = state.retro.filter((g) => g.system === sys);
    tiles.push({ key: 'retro:sys:' + sys, type: 'icon', icon: 'controller', label: shortSystem(sys), value: `${list.length} game${list.length === 1 ? '' : 's'}`, title: shortSystem(sys),
      activate: () => openLibrary({ title: shortSystem(sys), list, sort: 1 }) });
  }
  return { key: 'retro', title: 'retro', tiles: flow(tiles) };
}

// "Nintendo - Super Nintendo Entertainment System" -> "super nintendo entertainment system"
function shortSystem(sys) {
  return String(sys).replace(/^[^-]+ - /, '').toLowerCase();
}

// Steam collections (Favorites and your own), as folders.
function collectionGames(c) {
  const ids = new Set(c.appids);
  return state.all.filter((g) => ids.has(g.appid));
}

function collectionsPivot() {
  const cols = (state.lib.collections || []).map((c) => ({ ...c, games: collectionGames(c) })).filter((c) => c.games.length);
  if (!cols.length) return null;
  const tiles = cols.map((c) => ({ key: 'col:' + c.id, type: 'icon', icon: c.id === 'favorite' ? 'pin' : 'library', label: c.name.toLowerCase(), value: `${c.games.length} game${c.games.length === 1 ? '' : 's'}`, title: c.name.toLowerCase(),
    activate: () => openLibrary({ title: c.name.toLowerCase(), list: c.games, sort: 0 }) }));
  return { key: 'collections', title: 'collections', tiles: flow(tiles) };
}

// Friends, in game first, then online, then offline.
function friendTiles() {
  const friends = state.web && state.web.friends ? state.web.friends : [];
  const rank = (f) => (f.game ? 0 : f.state ? 1 : 2);
  const list = friends.map((f, i) => [f, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([f]) => f);
  return list.slice(0, state.settings.friendCount || 24).map((f) => ({
    key: 'friend:' + f.steamid, type: 'friend', friend: f, caption: f.name, title: f.name,
    value: f.game ? `playing ${f.game}` : f.state ? 'online' : 'offline',
    sub: f.game ? `playing ${f.game}` : f.state ? 'online' : 'offline',
    activate: () => openSteam('message', f.steamid),
  }));
}

// The same content as the pivots, as plain sections for the other
// dashboard styles: no grid positions, every game in games, no home.
const SECTION_ICONS = { search: 'search', games: 'controller', apps: 'grid', retro: 'controller', collections: 'library', video: 'bigpicture', streaming: 'stream', social: 'friends', steam: 'store', settings: 'gear' };
function catalog() {
  const hidden = new Set(state.settings.hiddenTabs || []);
  const strip = (t) => { const { c, r, w, h, hero, cycle, ...rest } = t; return rest; };
  return buildPivots().filter((pv) => pv.key !== 'home' && !hidden.has(pv.key)).map((pv) => {
    let items = pv.tiles.map(strip);
    if (pv.key === 'games') items = dashGames().map((g) => gameTile(g)).concat(items.filter((t) => t.type !== 'game'));
    return { key: pv.key, title: pv.title, icon: SECTION_ICONS[pv.key] || 'grid', items };
  });
}

// The games list the styles show, with the guide's sort and "show" filter.
function dashGames() {
  const f = state.settings.dashFilter || 'all';
  const pool = f === 'shortcuts' || f === 'pinned' ? state.steamGames.concat(state.shortcuts) : state.steamGames;
  return sorted(pool.filter((DASH_FILTERS[f] || DASH_FILTERS.all)[1]), state.settings.dashSort || 'recent');
}

function sortName(k) {
  return (SORTS.find(([v]) => v === k) || SORTS[0])[1];
}

// Steam downloads in progress (and queued updates).
function downloads() {
  return state.lib.games.filter((g) => g.downloading);
}

function openDownloads() {
  const list = downloads();
  if (!list.length) { toast('nothing is downloading'); return; }
  openLibrary({ title: 'downloads', list, sort: 0 });
}

// Quick resume, pins, then recently played games and streams, for styles
// with a "home" row. The count is the "recent games" setting.
function recentItems(n = state.settings.recentCount ?? 6) {
  if (!n) return [];
  const resume = resumeTile();
  const pinned = state.settings.pinned.map((id) => state.byId.get(id)).filter(Boolean);
  const rest = sorted(state.all, 'recent').filter((g) => !pinned.includes(g) && !(resume && resume.game === g));
  const games = pinned.concat(rest).slice(0, n - (resume ? 1 : 0)).map((g) => gameTile(g));
  return (resume ? [resume] : []).concat(games, state.streams.slice(0, 2).map(streamTile));
}

// The most recent thing to pick back up: the last game played, or a
// Jellyfin video with a saved position if that was watched more recently.
function resumeTarget() {
  const game = state.all.filter((g) => g.lastPlayed > 0).sort(byRecent)[0];
  const v = state.video && !state.video.error && state.video.resume ? state.video.resume[0] : null;
  if (v && (!game || (v.watched || 0) > game.lastPlayed)) return v;
  return game || v || null;
}

// "continue …": one press starts the game or resumes the video.
function resumeTile() {
  const g = resumeTarget();
  if (!g) return null;
  const jf = g.kind === 'jf';
  const name = jf && g.episode ? `${g.series} ${g.episode}` : g.name;
  return {
    key: 'resume', type: 'game', game: g, title: `continue ${name}`, caption: `continue ${name}`, label: `continue ${name}`,
    sub: jf ? `resume at ${fmtTime(g.position / 1e7)}` : gameSub(g),
    activate: () => (jf ? playVideo(g) : launch(g)),
  };
}

function notInstalled() {
  const list = (state.web && state.web.notInstalled) || [];
  return list.map((g) => ({
    id: 'owned:' + g.appid, kind: 'steam', appid: g.appid, gameId: g.appid, name: g.name, installed: false, notInstalled: true,
    lastPlayed: g.lastPlayed, playtime: g.playtime, size: 0,
  }));
}

async function searchGames() {
  const q = await openKeyboard({ title: 'search games' });
  if (!q) return;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = state.all.concat(notInstalled(), state.streams);
  const hits = pool.filter((g) => words.every((w) => g.name.toLowerCase().includes(w)));
  if (!hits.length) { toast(`nothing matches "${q}"`); return; }
  openLibrary({ title: `"${q}"`, list: hits, sort: 1 });
}

function gamerscoreText() {
  const a = state.web && state.web.enabled && state.web.achievements;
  return a && a.unlocked ? `${a.gamerscore.toLocaleString()} G` : '';
}

function displayName() {
  return state.settings.gamertag || (state.lib.user && state.lib.user.name) || 'player one';
}

// ---------- actions ----------

async function openSteam(action, id) {
  sound.play('select');
  try {
    await api.steam(action, id);
  } catch {
    sound.play('error');
    toast('could not reach steam');
  }
}

async function launch(g) {
  if (g.kind === 'jf') { if (g.type === 'Series') openVideoDetail(g); else playVideo(g); return; }
  if (g.kind === 'retro') {
    sound.play('launch');
    music.duck();
    notify('starting', g.name, { img: artUrl(g, 'boxart'), chime: false });
    try { await api.retroLaunch(g.appid); } catch { sound.play('error'); toast(`could not start retroarch for ${g.name}`); }
    return;
  }
  music.duck();
  sound.play('launch');
  wave();
  notify('starting game', g.name, { img: artUrl(g, 'header'), chime: false });
  try {
    await api.steam('run', g.gameId);
  } catch {
    sound.play('error');
    toast(`could not start ${g.name}`);
  }
}

async function startStream(g) {
  if (state.settings.wakeBeforeStream && !CAPTURE && !(await api.reachable(g.host))) {
    notify(`waking ${g.hostName}`, 'this can take up to a minute', { chime: true });
    const r = await api.wake(g.host);
    if (r === 'nomac') { sound.play('error'); toast(`${g.hostName} is off and its network address isn't known · settings › wake on lan`); return; }
    if (r === 'timeout') { sound.play('error'); toast(`${g.hostName} didn't wake up · is wake-on-lan on in its bios?`); return; }
  }
  sound.play('launch');
  music.duck();
  wave();
  notify(`streaming from ${g.hostName}`, g.name, { img: g.boxart ? artUrl(g) : null, chime: false });
  try {
    await api.stream(g.host, g.appid);
  } catch {
    sound.play('error');
    toast(`could not start moonlight for ${g.name}`);
  }
}

async function togglePin(g) {
  const pinned = isPinned(g) ? state.settings.pinned.filter((p) => p !== g.id) : [g.id, ...state.settings.pinned];
  state.settings = await api.setSettings({ pinned });
  sound.play('select');
  toast(isPinned(g) ? `pinned ${g.name} to spotlight` : `unpinned ${g.name}`);
  rebuild();
}

// ---------- dashboard ----------

const dash = $('#dash');

function focusIndex(ch) {
  const i = state.focus[ch.key] || 0;
  return Math.max(0, Math.min(ch.tiles.length - 1, i));
}

function caption(t) {
  const main = t.caption || t.label || t.title;
  const sub = t.type === 'icon' || t.type === 'avatar' || t.type === 'friend' ? t.value : '';
  return `<div class="t-cap"><b>${esc(main)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
}

function tileEl(t) {
  const e = el('div', `tile t-${t.type}` + (t.w > 1 || t.h > 1 ? ' big' : '') + (t.cls ? ' ' + t.cls : ''));
  e.dataset.key = t.key;
  if (t.type === 'game') {
    e.append(artEl(t.game, t.hero ? ['hero', 'header'] : ['header', 'portrait']));
    if (t.hero) e.classList.add('hero');
    if (isPinned(t.game)) e.append(el('div', 'badge pin', icon('pin')));
    if (t.game.kind === 'shortcut') e.append(el('div', 'badge kind', 'app'));
  } else if (t.type === 'stream' && t.game.boxart) {
    e.append(artEl(t.game, ['boxart']));
    e.append(el('div', 'badge kind', 'stream'));
  } else if (t.type === 'friend') {
    e.append(el('div', 'f-pic', t.friend.avatar ? `<img alt="" src="${esc(t.friend.avatar)}">` : icon('user')));
    e.classList.add(t.friend.game ? 'in-game' : t.friend.state ? 'online' : 'offline');
  } else if (t.type === 'avatar') {
    e.append(el('div', 'avatar-tile', avatarPic(look(), 'full', 320, 'av-full')));
  } else if (t.type === 'profile') {
    const pic = el('div', 'profile-pic big-pic', '');
    fillGamerpic(pic, state.lib.user);
    e.append(pic);
    t.caption = displayName();
    t.value = gamesLine();
    e.classList.add('t-avatar');
  } else {
    e.innerHTML = icon(t.icon || 'grid', 'tile-ico');
    if (t.type === 'stream') e.append(el('div', 'badge kind', 'stream'));
  }
  e.insertAdjacentHTML('beforeend', caption(t.type === 'profile' ? { ...t, type: 'avatar' } : t));
  if (t.game && t.game.downloading) {
    const pct = t.game.progress != null ? Math.round(t.game.progress * 100) : null;
    e.insertAdjacentHTML('beforeend', `<div class="dl-bar"><i style="width:${pct ?? 30}%"></i><span>${pct != null ? pct + '%' : 'downloading'}</span></div>`);
    if (pct == null) e.classList.add('dl-unknown');
  }
  return e;
}

function gamesLine() {
  const n = state.all.length;
  const g = gamerscoreText();
  return `${n} game${n === 1 ? '' : 's'} · ${g || totalHours() + ' hrs'}`;
}

function totalHours() {
  return Math.round(state.all.reduce((n, g) => n + (g.playtime || 0), 0) / 60);
}

function renderDash() {
  dash.innerHTML = '';
  const head = el('div', 'pv-head');
  const strip = el('div', 'pv-strip');
  state.channels.forEach((pv, pi) => {
    const lab = el('div', 'pv-label', esc(pv.title));
    lab.addEventListener('click', () => { if (!state.overlays.length && pi !== state.ch) { state.ch = pi; sound.play('channel'); layout(); } });
    head.append(lab);
    pv.tiles.forEach((t, ti) => {
      const te = tileEl(t);
      te.dataset.p = pi;
      te.dataset.t = ti;
      te.addEventListener('click', () => clickTile(pi, ti));
      strip.append(te);
    });
  });
  dash.append(head, strip);
  layout();
}

function clickTile(pi, ti) {
  if (state.overlays.length) return;
  if (pi === state.ch && focusIndex(state.channels[pi]) === ti) { activateTile(); return; }
  state.ch = pi;
  state.focus[state.channels[pi].key] = ti;
  sound.play('move');
  layout();
}

function metrics() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Tile size from 0.5.0 (readable on a TV), with the console's tight gaps.
  const g = Math.max(3, Math.round(vh * 0.005));
  const fullH = Math.min(vh * 0.6, vw * 0.36);
  const gridH = fullH * (TILE_SIZES[state.settings.tileSize] || 1);
  const v = (gridH - 2 * g) / ROWS;
  const u = v * 1.32;
  const homeCols = 4;
  const homeW = homeCols * u + (homeCols - 1) * g;
  const x0 = Math.max(40, (vw - homeW) / 2);
  // Neighbouring pivots only peek in from the screen edges.
  return { vw, vh, g, u, v, x0, top: Math.max(120, vh * 0.2) + Math.max(0, fullH - gridH) / 2, gap: Math.max(u * 0.62, x0 - u * 0.45) };
}

// Pivot start columns in strip pixels.
function pivotX(m) {
  const xs = [];
  let x = 0;
  for (const pv of state.channels) {
    xs.push(x);
    const cols = Math.max(1, ...pv.tiles.map((t) => t.c + t.w));
    x += cols * (m.u + m.g) - m.g + m.gap;
  }
  return xs;
}

function tileRect(t, m, px) {
  return {
    x: px + t.c * (m.u + m.g),
    y: t.r * (m.v + m.g),
    w: t.w * m.u + (t.w - 1) * m.g,
    h: t.h * m.v + (t.h - 1) * m.g,
  };
}

// Home's lower game tiles show the next games every few seconds.
let cycleStep = 0;
function cycleTiles() {
  const home = state.channels.find((c) => c.key === 'home');
  if (!home || document.hidden || state.settings.cycleTiles === false || state.view !== metroLook) return;
  const tiles = home.tiles.filter((t) => t.cycle && t.cycle.list.length > 2);
  if (!tiles.length) return;
  cycleStep++;
  const hi = state.channels.indexOf(home);
  for (const t of tiles) {
    const focused = state.ch === hi && home.tiles[focusIndex(home)] === t;
    if (focused) continue;
    const list = t.cycle.list;
    const g = list[(t.cycle.slot + cycleStep * 2) % list.length];
    if (!g || g === t.game) continue;
    const ti = home.tiles.indexOf(t);
    const te = dash.querySelector(`.tile[data-p="${hi}"][data-t="${ti}"]`);
    if (!te) continue;
    Object.assign(t, { game: g, key: g.id + ':cycle' + t.cycle.slot, title: g.name, sub: gameSub(g), caption: null });
    const fresh = artEl(g, ['header', 'portrait']);
    fresh.classList.add('fade-in');
    const old = te.querySelector('.art');
    te.insertBefore(fresh, old);
    old.classList.add('fade-out');
    setTimeout(() => old.remove(), 700);
    const cap = te.querySelector('.t-cap b');
    if (cap) cap.textContent = g.name;
  }
  renderHints();
}
setInterval(cycleTiles, 6000);

// On the steam pivot your avatar stands beside the tiles, like the
// console's avatar screens.
function avatarShown() {
  const ch = state.channels[state.ch];
  return !!(GL && state.view === metroLook && ch && ch.key === 'steam' && !state.overlays.length);
}

function placeStandingAvatar(m, xs) {
  const av = $('#avatar');
  const show = avatarShown();
  if (show && !dashAvatar) {
    const c = document.createElement('canvas');
    av.replaceChildren(c);
    dashAvatar = new AvatarView(c);
    dashAvatar.setLook(look());
  }
  const pv = state.channels[state.ch];
  const cols = Math.max(1, ...pv.tiles.map((t) => t.c + t.w));
  const gridRight = m.x0 + cols * (m.u + m.g) - m.g;
  const next = xs[state.ch + 1] !== undefined ? xs[state.ch + 1] - xs[state.ch] + m.x0 : m.vw;
  const room = Math.max(120, Math.min(m.vw, next) - gridRight);
  const h = Math.min(m.vh * 0.62, room * 1.9);
  const w = h * 0.5;
  av.style.height = h + 'px';
  av.style.width = w + 'px';
  av.style.left = (gridRight + (room - w) / 2) + 'px';
  av.style.top = (m.top + 3 * m.v + 2 * m.g - h * 0.93) + 'px';
  av.classList.toggle('show', show);
  if (dashAvatar) { if (show) dashAvatar.start(); else dashAvatar.stop(); }
}

function layout() {
  const m = metrics();
  const xs = pivotX(m);
  const pv = state.channels[state.ch];
  const fi = focusIndex(pv);
  const ft = pv.tiles[fi];
  const fr = ft ? tileRect(ft, m, xs[state.ch]) : { x: xs[state.ch], w: 0 };
  let scroll = xs[state.ch] - m.x0;
  const right = m.vw - m.x0 * 0.55;
  if (fr.x + fr.w - scroll > right) scroll = fr.x + fr.w - right;
  dash.style.setProperty('--u', m.u + 'px');
  dash.style.setProperty('--v', m.v + 'px');
  const strip = dash.querySelector('.pv-strip');
  strip.style.top = m.top + 'px';
  strip.style.height = (ROWS * m.v + 2 * m.g) + 'px';
  strip.style.transform = `translate3d(${-scroll}px, 0, 0)`;
  for (const te of strip.children) {
    const pi = +te.dataset.p;
    const t = state.channels[pi].tiles[+te.dataset.t];
    const r = tileRect(t, m, xs[pi]);
    te.style.left = r.x + 'px';
    te.style.top = r.y + 'px';
    te.style.width = r.w + 'px';
    te.style.height = r.h + 'px';
    te.classList.toggle('focused', pi === state.ch && +te.dataset.t === fi);
    te.classList.toggle('other', pi !== state.ch);
  }
  // Labels: the current one lines up with the grid's left edge.
  const head = dash.querySelector('.pv-head');
  head.style.top = (m.top - Math.max(40, m.vh * 0.085)) + 'px';
  const labels = [...head.children];
  labels.forEach((l, i) => l.classList.toggle('on', i === state.ch));
  const cur = labels[state.ch];
  if (cur) head.style.transform = `translate3d(${m.x0 - cur.offsetLeft}px, 0, 0)`;
  placeStandingAvatar(m, xs);
  renderHints();
}

function metroCurrent() {
  const ch = state.channels[state.ch];
  return ch && ch.tiles[focusIndex(ch)];
}

function currentTile() {
  return state.view ? state.view.current() : null;
}

function activateTile() {
  const t = currentTile();
  if (!t) return;
  if (t.activate) { sound.play('select'); t.activate(); return; }
  if (t.type === 'game') { sound.play('open'); openDetail(t.game); return; }
  if (t.type === 'stream') { startStream(t.game); }
}

// Spatial move inside the pivot; off the left/right edge goes to the
// neighbouring pivot, entering at the closest tile.
function move(dir) {
  const pv = state.channels[state.ch];
  const cur = pv.tiles[focusIndex(pv)];
  if (!cur) return;
  const cx = cur.c + cur.w / 2;
  const cy = cur.r + cur.h / 2;
  let best = -1;
  let bestScore = Infinity;
  pv.tiles.forEach((t, i) => {
    if (t === cur) return;
    const tx = t.c + t.w / 2;
    const ty = t.r + t.h / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const ahead = { left: -dx, right: dx, up: -dy, down: dy }[dir];
    if (ahead <= 0.01) return;
    // Must overlap on the other axis, or be close to it.
    const across = dir === 'left' || dir === 'right'
      ? Math.max(0, Math.abs(dy) - (t.h + cur.h) / 2 + 0.01)
      : Math.max(0, Math.abs(dx) - (t.w + cur.w) / 2 + 0.01);
    const score = ahead + across * 3;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  if (best >= 0) {
    state.focus[pv.key] = best;
    sound.play('move');
    layout();
    return;
  }
  if (dir === 'left' || dir === 'right') switchPivot(dir === 'left' ? -1 : 1, cy);
}

function switchPivot(delta, row = null) {
  const n = state.ch + delta;
  if (n < 0 || n >= state.channels.length) return;
  state.ch = n;
  const pv = state.channels[n];
  if (row !== null) {
    // Enter from the near edge, on the closest row.
    const edge = delta > 0 ? Math.min(...pv.tiles.map((t) => t.c)) : Math.max(...pv.tiles.map((t) => t.c + t.w));
    let best = 0;
    let bestScore = Infinity;
    pv.tiles.forEach((t, i) => {
      const ex = delta > 0 ? t.c - edge : edge - (t.c + t.w);
      const score = ex * 3 + Math.abs(t.r + t.h / 2 - row);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    state.focus[pv.key] = best;
  }
  sound.play('channel');
  layout();
}

function dashHandle(a) {
  if (state.view.handle(a)) return;
  const t = currentTile();
  switch (a) {
    case 'a': activateTile(); break;
    case 'x': if (t && t.type === 'game') launch(t.game); else if (t && t.type === 'stream') startStream(t.game); break;
    case 'y': if (t && (t.type === 'game' || t.type === 'stream')) togglePin(t.game); break;
    case 'b': if (state.view.home()) sound.play('back'); break;
    case 'start': if (t && t.type === 'game') { sound.play('open'); openDetail(t.game); } else openGuide(); break;
    case 'view': case 'guide': openGuide(); break;
    default:
  }
}

// The 2011 pivots, as a dashboard style.
const metroLook = {
  id: 'metro',
  render: renderDash,
  layout,
  current: metroCurrent,
  handle(a) {
    if (a === 'left' || a === 'right' || a === 'up' || a === 'down') { move(a); return true; }
    if (a === 'lb' || a === 'rb') { switchPivot(a === 'lb' ? -1 : 1); return true; }
    return false;
  },
  home() {
    const hi = state.channels.findIndex((c) => c.key === 'home');
    if (state.ch === hi && focusIndex(state.channels[hi]) === 0) return false;
    state.ch = hi;
    state.focus.home = 0;
    layout();
    return true;
  },
  goto(key) {
    const ci = state.channels.findIndex((c) => c.key === key);
    if (ci >= 0) { state.ch = ci; state.focus[key] = 0; layout(); }
  },
  hints: () => [['lb', 'switch']],
  destroy() { dash.innerHTML = ''; },
};

// Shared with the other styles (src/renderer/looks).
const lookCtx = {
  state, el, esc, icon, artEl, artUrl, sound, AvatarView,
  get GL() { return GL; },
  catalog, recentItems, isPinned, gameSub, timeAgo, displayName, gamesLine, gamerscoreText, look: () => look(),
  avatarPic: (...a) => avatarPic(...a), fillGamerpic: (...a) => fillGamerpic(...a),
  activate: () => activateTile(),
  // Start a game, stream or video straight away (A opens details).
  play: (t) => {
    if (t && t.type === 'game' && t.game.kind === 'jf') playVideo(t.game);
    else if (t && t.type === 'game') launch(t.game);
    else if (t && t.type === 'stream') startStream(t.game);
    else activateTile();
  },
  activateUser: () => openSignIn(),
  // Customize settings, for the styles: null = the style's own colors.
  accent: () => TILE_HEX[state.settings.tileColor] || null,
  backdrop: () => BG_HEX[state.settings.bgColor] || null,
  scale: () => TILE_SIZES[state.settings.tileSize] || 1,
  hints: () => renderHints(), openGuide: () => openGuide(), openLibrary: (o) => openLibrary(o),
};

function makeLook(id) {
  if (id !== 'metro' && LOOK_MODULES[id]) return LOOK_MODULES[id](lookCtx, dash);
  return metroLook;
}

// Builds the dashboard in the chosen style.
function renderView() {
  const want = state.settings.look || 'metro';
  if (!state.view || state.view.id !== want) {
    if (state.view) state.view.destroy();
    state.view = makeLook(want);
    document.body.dataset.look = state.view.id;
    if (dashAvatar && state.view.id !== 'metro') dashAvatar.stop();
  }
  state.view.render();
  renderHints();
}

function dashHints() {
  const t = currentTile();
  const h = [['a', 'select']];
  if (t && t.type === 'game') h.push(['x', 'play'], ['y', isPinned(t.game) ? 'unpin' : 'pin'], ['start', 'details']);
  else if (t && t.type === 'stream') h.push(['y', isPinned(t.game) ? 'unpin' : 'pin']);
  if (state.view && state.view.hints) h.push(...state.view.hints());
  return h;
}

// Keeps focus on the same tile (by key) when pivots are rebuilt.
function rebuild() {
  const keepCh = state.channels[state.ch] && state.channels[state.ch].key;
  const keepTiles = {};
  for (const ch of state.channels) {
    const t = ch.tiles[focusIndex(ch)];
    if (t) keepTiles[ch.key] = t.key;
  }
  state.channels = buildChannels();
  const ci = state.channels.findIndex((c) => c.key === keepCh);
  state.ch = ci >= 0 ? ci : Math.min(state.ch, state.channels.length - 1);
  for (const ch of state.channels) {
    const ti = ch.tiles.findIndex((t) => t.key === keepTiles[ch.key]);
    if (ti >= 0) state.focus[ch.key] = ti;
  }
  renderView();
  renderGamercard();
}

function dressAvatar() {
  for (const e of document.querySelectorAll('.tile .avatar-tile')) e.innerHTML = avatarPic(look(), 'full', 320, 'av-full');
  if (dashAvatar) dashAvatar.setLook(look());
}

function wave() { if (dashAvatar) dashAvatar.wave(); }

function look() {
  return normalizeLook(state.settings.avatarLook);
}

// ---------- gamercard / clock ----------

function fillGamerpic(box, user) {
  box.innerHTML = '';
  const pick = state.settings.gamerpic;
  if (pick && pick !== 'avatar') {
    const img = new Image();
    img.alt = '';
    img.src = 'nostalgia://gamerpics/' + encodeURIComponent(pick);
    img.onerror = () => { box.innerHTML = avatarPic(look()); };
    box.append(img);
    return;
  }
  if (pick !== 'avatar' && user && user.avatar) {
    const img = new Image();
    img.alt = '';
    img.src = `nostalgia://art/avatar/${user.steamId64}/img?v=${state.avatarStamp}`;
    img.onerror = () => { box.innerHTML = avatarPic(look()); };
    box.append(img);
  } else {
    box.innerHTML = avatarPic(look());
  }
}

function renderGamercard() {
  $('#gamercard .gc-name').textContent = displayName();
  $('#gamercard .gc-sub').textContent = gamerscoreText() || (state.lib.user ? 'online' : 'offline');
  fillGamerpic($('#gamercard .gc-pic'), state.lib.user);
}

function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ---------- hints ----------

function renderHints() {
  document.body.classList.toggle('has-overlay', state.overlays.length > 0);
  $('#avatar').classList.toggle('show', avatarShown());
  if (dashAvatar) { if (avatarShown()) dashAvatar.start(); else dashAvatar.stop(); }
  const top = state.overlays[state.overlays.length - 1];
  const hints = top ? top.hints() : dashHints();
  $('#hints').innerHTML = hints.map(([b, label]) =>
    `<span class="hint"><span class="btn btn-${b}">${{ view: '', start: '', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT' }[b] ?? b.toUpperCase()}</span>${esc(label)}</span>`).join('');
}

// ---------- overlays ----------

function pushOverlay(view) {
  state.overlays.push(view);
  $('#overlay-root').append(view.el);
  requestAnimationFrame(() => requestAnimationFrame(() => view.el.classList.add('in')));
  renderHints();
}

function popOverlay({ silent = false } = {}) {
  const view = state.overlays.pop();
  if (!view) return;
  if (!silent) sound.play('close');
  view.el.classList.remove('in');
  view.el.classList.add('out');
  setTimeout(() => view.el.remove(), 420);
  if (view.onClose) view.onClose();
  renderHints();
}

function closeAll() {
  while (state.overlays.length) popOverlay({ silent: true });
}

// Vertical button list shared by the detail blade and the guide.
function menu(items, container, onChange) {
  let i = 0;
  const els = items.map((it, idx) => {
    const b = el('button', 'menu-item', `${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.note ? `<small>${esc(it.note)}</small>` : ''}`);
    b.tabIndex = -1;
    b.addEventListener('click', () => { set(idx); it.run(); });
    container.append(b);
    return b;
  });
  function set(n) {
    i = Math.max(0, Math.min(items.length - 1, n));
    els.forEach((e, k) => e.classList.toggle('focused', k === i));
    if (els[i]) els[i].scrollIntoView({ block: 'nearest' });
    if (onChange) onChange(items[i]);
  }
  set(0);
  return {
    move(d) { const before = i; set(i + d); if (i !== before) sound.play('move'); },
    run() { sound.play('select'); items[i].run(); },
    set,
    index: () => i,
  };
}

function openDetail(g) {
  if (g.kind === 'jf') { openVideoDetail(g); return; }
  const root = el('div', 'overlay detail');
  root.append(el('div', 'scrim'));
  const blade = el('div', 'blade');
  root.append(blade);
  root.querySelector('.scrim').addEventListener('click', () => popOverlay());

  const hero = el('div', 'hero');
  hero.append(artEl(g, ['hero', 'header']));
  const logo = new Image();
  logo.className = 'logo';
  logo.alt = '';
  logo.src = artUrl(g, 'logo');
  logo.onerror = () => { logo.remove(); hero.append(el('div', 'logo-text', esc(g.name))); };
  hero.append(logo);
  blade.append(hero);

  const body = el('div', 'detail-body');
  const list = el('div', 'menu');
  const info = el('div', 'detail-info');
  body.append(list, info);
  blade.append(body);

  const ach = state.web && state.web.achievements.perGame[g.appid];
  const meta = [
    g.notInstalled ? 'not installed' : g.kind === 'shortcut' ? 'non-steam shortcut' : g.kind === 'retro' ? `retroarch · ${shortSystem(g.system)}` : 'steam game',
    ach ? `${ach.unlocked} of ${ach.total} achievements · ${ach.score}G` : '',
    g.downloading ? `downloading${g.progress != null ? ` · ${Math.round(g.progress * 100)}%` : ''}` : '',
    timeAgo(g.lastPlayed),
    hours(g.playtime),
    g.size ? `${bytes(g.size)} on disk` : '',
    g.needsUpdate ? 'update pending' : '',
  ].filter(Boolean);
  info.innerHTML = `<h1>${esc(g.name)}</h1><ul>${meta.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
    + (g.installDir ? `<p class="path">${esc(g.installDir)}</p>` : '');

  const items = g.notInstalled ? [
    { icon: 'downloads', label: 'install', run: () => { popOverlay({ silent: true }); openSteam('install', g.appid); notify('installing', g.name, { img: artUrl(g, 'header') }); } },
  ] : [
    { icon: 'play', label: 'play', note: g.needsUpdate ? 'steam updates it first' : '', run: () => { popOverlay({ silent: true }); launch(g); } },
    { icon: 'pin', label: isPinned(g) ? 'unpin from spotlight' : 'pin to spotlight', run: () => { popOverlay({ silent: true }); togglePin(g); } },
  ];
  if (ach && !g.notInstalled) items.push({ icon: 'sparkle', label: 'achievements', note: `${ach.unlocked} / ${ach.total}`, run: () => openAchievements(g) });
  if (g.kind === 'steam' && !state.settings.kid) {
    items.push(
      { icon: 'info', label: 'view in steam', run: () => openSteam('details', g.appid) },
      { icon: 'store', label: 'store page', run: () => openSteam('store', g.appid) },
    );
  }
  if (!state.settings.kid && !g.notInstalled) {
    const hidden = state.settings.hidden.includes(g.id);
    const steamHidden = g.kind === 'steam' && (state.lib.steamHidden || []).includes(g.appid);
    if (!steamHidden) items.push({ icon: hidden ? 'grid' : 'mute', label: hidden ? 'show on the dashboard' : 'hide from the dashboard', run: () => { popOverlay({ silent: true }); toggleHidden(g); } });
  }
  const m = menu(items, list);

  pushOverlay({
    el: root,
    handle(a) {
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'a') m.run();
      else if (a === 'x') { popOverlay({ silent: true }); launch(g); }
      else if (a === 'y') { popOverlay({ silent: true }); togglePin(g); }
      else if (a === 'b' || a === 'left') popOverlay();
      else if (a === 'view' || a === 'guide') openGuide();
    },
    hints: () => [['a', 'select'], ['x', 'play'], ['b', 'back']],
  });
}

async function toggleHidden(g) {
  const on = state.settings.hidden.includes(g.id);
  const hidden = on ? state.settings.hidden.filter((x) => x !== g.id) : [...state.settings.hidden, g.id];
  state.settings = await api.setSettings({ hidden });
  rebuild();
  toast(on ? `${g.name} is back on the dashboard` : `${g.name} is hidden · settings › hidden games brings it back`);
}

// Every achievement of a game: unlocked first (newest first), then locked.
async function openAchievements(g) {
  const list = await api.achievements(g.appid);
  if (!list || !list.length) { toast('no achievement details for this game yet'); return; }
  sound.play('open');
  const root = el('div', 'overlay library achievements');
  const panel = el('div', 'lib-panel');
  const got = list.filter((a) => a.unlocked).length;
  panel.append(el('div', 'lib-head', `<h1>${esc(g.name)}</h1><span class="ach-count">${got} of ${list.length} · ${got * 10}G</span>`));
  const grid = el('div', 'ach-list');
  panel.append(grid);
  root.append(panel);
  const rows = list.map((a) => {
    const r = el('div', 'ach' + (a.unlocked ? ' on' : ''));
    const pic = a.icon ? `<img alt="" src="nostalgia://ach/${esc(g.appid)}/${esc(a.icon)}.jpg">` : icon(a.unlocked ? 'sparkle' : 'clock');
    r.innerHTML = `<div class="ach-pic">${pic}</div><div class="ach-text"><b>${esc(a.name)}</b><span>${esc(a.desc || '')}</span></div><small>${a.unlocked ? (a.at ? esc(new Date(a.at * 1000).toLocaleDateString()) : 'unlocked') : '10G'}</small>`;
    grid.append(r);
    return r;
  });
  let i = 0;
  const set = (n) => {
    i = Math.max(0, Math.min(rows.length - 1, n));
    rows.forEach((r, k) => r.classList.toggle('focused', k === i));
    rows[i].scrollIntoView({ block: 'nearest' });
  };
  set(0);
  pushOverlay({
    el: root,
    handle(a) {
      if (a === 'up' || a === 'down') { set(i + (a === 'up' ? -1 : 1)); sound.play('move'); }
      else if (a === 'lt' || a === 'rt') set(i + (a === 'lt' ? -8 : 8));
      else if (a === 'b' || a === 'a') popOverlay();
    },
    hints: () => [['b', 'back']],
  });
}

function openLibrary({ title = 'game library', filter = null, sort: startSort = null, list = null } = {}) {
  // The plain library follows the guide's sort and "show" filter.
  if (!filter && !list && DASH_FILTERS[state.settings.dashFilter] && state.settings.dashFilter !== 'all') {
    filter = DASH_FILTERS[state.settings.dashFilter][1];
    title += ` · ${DASH_FILTERS[state.settings.dashFilter][0]}`;
  }
  if (startSort == null) startSort = Math.max(0, SORTS.findIndex(([v]) => v === state.settings.dashSort));
  const root = el('div', 'overlay library');
  const panel = el('div', 'lib-panel');
  root.append(panel);
  const head = el('div', 'lib-head', `<h1>${esc(title)}</h1>`);
  const tabs = el('div', 'lib-tabs');
  head.append(tabs);
  const grid = el('div', 'lib-grid');
  const cap = el('div', 'lib-caption');
  panel.append(head, grid, cap);

  let sort = startSort ?? 0;
  let i = 0;
  let items = [];
  let cards = [];

  function renderTabs() {
    tabs.innerHTML = `<span class="btn btn-lb">LB</span>${SORTS.map(([, label], k) => `<span class="tab${k === sort ? ' on' : ''}">${label}</span>`).join('')}<span class="btn btn-rb">RB</span>`;
  }

  function renderGrid() {
    const keep = items[i] && items[i].id;
    items = sorted(list || (filter ? state.all.concat(state.streams).filter(filter) : state.all), SORTS[sort][0]);
    grid.innerHTML = '';
    cards = items.map((g, k) => {
      const c = el('div', 'card');
      c.append(artEl(g, ['portrait', 'header'], { portrait: true, lazy: true }));
      if (isPinned(g)) c.append(el('div', 'badge pin', icon('pin')));
      c.append(el('div', 'card-name', esc(g.name)));
      c.addEventListener('click', () => { if (k === i) { sound.play('open'); openDetail(g); } else { focus(k); sound.play('move'); } });
      grid.append(c);
      return c;
    });
    const k = items.findIndex((g) => g.id === keep);
    focus(k >= 0 ? k : 0, true);
  }

  function cols() {
    if (cards.length < 2) return 1;
    const top = cards[0].offsetTop;
    const n = cards.findIndex((c) => c.offsetTop !== top);
    return n < 0 ? cards.length : n;
  }

  function focus(n, instant = false) {
    if (!cards.length) { cap.innerHTML = '<div class="cap-title">no games</div>'; return; }
    i = Math.max(0, Math.min(cards.length - 1, n));
    cards.forEach((c, k) => c.classList.toggle('focused', k === i));
    cards[i].scrollIntoView({ block: 'nearest', behavior: instant ? 'instant' : 'smooth' });
    const g = items[i];
    cap.innerHTML = `<div class="cap-title">${esc(g.name)}</div><div class="cap-sub">${esc(gameSub(g))}${g.size ? ' · ' + esc(bytes(g.size)) : ''}</div><div class="cap-count">${i + 1} of ${items.length}</div>`;
  }

  function move(d) {
    const before = i;
    focus(i + d);
    if (i !== before) sound.play('move');
  }

  renderTabs();
  pushOverlay({
    el: root,
    handle(a) {
      const c = cols();
      if (a === 'left') move(-1);
      else if (a === 'right') move(1);
      else if (a === 'up') move(-c);
      else if (a === 'down') move(c);
      else if (a === 'lt') move(-c * 3);
      else if (a === 'rt') move(c * 3);
      else if (a === 'lb' || a === 'rb') {
        sort = (sort + (a === 'rb' ? 1 : SORTS.length - 1)) % SORTS.length;
        sound.play('channel');
        renderTabs();
        renderGrid();
      } else if (a === 'a' && items[i]) { sound.play('open'); openDetail(items[i]); }
      else if (a === 'x' && items[i]) launch(items[i]);
      else if (a === 'y' && items[i]) togglePin(items[i]).then(renderGrid);
      else if (a === 'b') popOverlay();
      else if (a === 'view' || a === 'guide') openGuide();
    },
    hints: () => [['a', 'details'], ['x', 'play'], ['y', 'pin'], ['lb', 'sort'], ['b', 'back']],
  });
  // Cards need layout before columns and scrolling make sense.
  requestAnimationFrame(renderGrid);
}

// The guide: a dark glossy panel with a gamercard and tabs (LB/RB).
function openGuide() {
  if (state.overlays.some((o) => o.guide)) return;
  sound.play('open');
  const root = el('div', 'overlay guide');
  root.append(el('div', 'scrim'));
  root.querySelector('.scrim').addEventListener('click', () => popOverlay());
  const panel = el('div', 'guide-panel');
  root.append(panel);
  panel.append(el('div', 'guide-orb'));
  const tabsEl = el('div', 'guide-tabs');
  panel.append(tabsEl);
  const card = el('div', 'guide-card');
  const pic = el('div', 'gc-pic');
  fillGamerpic(pic, state.lib.user);
  card.append(pic, el('div', 'guide-who', `<b>${esc(displayName())}</b><span>${gamesLine()}</span><span class="guide-online">${icon('controller')} online · steam</span>`));
  panel.append(card);
  const list = el('div', 'menu');
  panel.append(list);

  const goChannel = (key) => () => {
    closeAll();
    if (key === 'home') state.view.home(); else if (state.view.goto) state.view.goto(key);
  };
  const recent = state.all.filter((g) => g.lastPlayed > 0).sort(byRecent).slice(0, 5);
  const ml = state.lib.moonlight;
  const tabs = [
    { icon: 'controller', label: 'home', items: () => [
      { icon: 'controller', label: 'dashboard home', run: goChannel('home') },
      { icon: 'grid', label: 'game library', note: `${state.all.length}`, run: () => { closeAll(); openLibrary(); } },
      { icon: 'user', label: 'my avatar', run: () => { closeAll(); openAvatarEditor(); } },
      { icon: 'image', label: 'change gamerpic', run: () => { closeAll(); openGamerpics(); } },
      { icon: 'friends', label: 'switch profile', run: () => { closeAll(); openSignIn(); } },
      { icon: 'controller', label: 'controls and help', run: () => { closeAll(); openControls(); } },
      ...(state.settings.kid ? [] : [
        { icon: 'bigpicture', label: 'steam big picture', run: () => { closeAll(); openSteam('bigpicture'); } },
        { icon: 'fullscreen', label: 'toggle full screen', run: () => api.toggleFullscreen() },
        { icon: 'power', label: 'power', note: 'sleep, restart, steam', run: () => { closeAll(); openPower(); } },
        { icon: 'power', label: 'quit nostalgiaconsole', run: () => api.quit() },
      ]),
    ] },
    { icon: 'play', label: 'games', items: () => [
      ...(resumeTile() ? [{ icon: 'play', label: resumeTile().title, note: 'quick resume', run: () => { closeAll(); resumeTile().activate(); } }] : []),
      { icon: 'grid', label: `sort games: ${sortName(state.settings.dashSort)}`, run: () => guideSet({ dashSort: SORTS[(SORTS.findIndex(([v]) => v === state.settings.dashSort) + 1) % SORTS.length][0] }) },
      { icon: 'search', label: `show: ${(DASH_FILTERS[state.settings.dashFilter] || DASH_FILTERS.all)[0]}`, run: () => { const ks = Object.keys(DASH_FILTERS); guideSet({ dashFilter: ks[(ks.indexOf(state.settings.dashFilter) + 1) % ks.length] }); } },
      ...(downloads().length ? [{ icon: 'downloads', label: 'downloads', note: `${downloads().length}`, run: () => { closeAll(); openDownloads(); } }] : []),
      ...recent.map((g) => ({ icon: 'play', label: g.name, note: timeAgo(g.lastPlayed).replace('played ', ''), run: () => { closeAll(); launch(g); } })),
      { icon: 'grid', label: 'all games', run: () => { closeAll(); openLibrary(); } },
    ] },
    { icon: 'stream', label: 'streaming', items: () => [
      ...state.streams.map((g) => ({ icon: 'stream', label: g.name, note: g.hostName, run: () => { closeAll(); startStream(g); } })),
      ...(ml && ml.installed && !state.settings.kid ? [{ icon: 'stream', label: 'open moonlight', run: () => { closeAll(); api.openMoonlight(); } }] : []),
      ...(!state.streams.length && !(ml && ml.installed) ? [{ icon: 'info', label: 'moonlight is not installed', run: () => {} }] : []),
    ] },
    ...(state.settings.kid ? [] : [{ icon: 'gear', label: 'settings', items: () => [
      { icon: 'gear', label: 'dashboard settings', run: goChannel('settings') },
      { icon: 'grid', label: `dashboard style: ${LOOK_NAMES[state.settings.look] || 'metro'}`, run: async () => { const ks = Object.keys(LOOK_NAMES); state.settings = await api.setSettings({ look: ks[(ks.indexOf(state.settings.look) + 1) % ks.length] }); applySettings(); rebuild(); show(tab, m.index()); } },
      { icon: 'grid', label: 'customize', run: () => { closeAll(); openCustomize(); } },
      { icon: 'palette', label: `theme: ${state.settings.theme}`, run: async () => { state.settings = await api.setSettings({ theme: THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length] }); applySettings(); rebuild(); show(tab, m.index()); } },
      { icon: state.settings.sound ? 'sound' : 'mute', label: `sounds: ${state.settings.sound ? 'on' : 'off'}`, run: async () => { state.settings = await api.setSettings({ sound: !state.settings.sound }); applySettings(); show(tab, m.index()); } },
      { icon: 'gear', label: 'steam settings', run: () => { closeAll(); openSteam('settings'); } },
    ] }]),
  ];

  let tab = 0;
  let m = null;
  // Changes a setting from the guide and keeps the guide where it was.
  const guideSet = async (patch) => { state.settings = await api.setSettings(patch); applySettings(); rebuild(); show(tab, m.index()); };
  function show(t, at = 0) {
    tab = (t + tabs.length) % tabs.length;
    tabsEl.innerHTML = `<span class="btn btn-lb">LB</span>${tabs.map((tb, k) => `<span class="gtab${k === tab ? ' on' : ''}">${icon(tb.icon)}<em>${esc(tb.label)}</em></span>`).join('')}<span class="btn btn-rb">RB</span>`;
    [...tabsEl.querySelectorAll('.gtab')].forEach((e, k) => e.addEventListener('click', () => { sound.play('channel'); show(k); }));
    list.innerHTML = '';
    m = menu(tabs[tab].items(), list);
    m.set(at);
  }
  show(0);

  pushOverlay({
    el: root,
    guide: true,
    handle(a) {
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'lb' || a === 'left') { sound.play('channel'); show(tab - 1); }
      else if (a === 'rb' || a === 'right') { sound.play('channel'); show(tab + 1); }
      else if (a === 'a') m.run();
      else if (a === 'b' || a === 'view' || a === 'guide') popOverlay();
    },
    hints: () => [['a', 'select'], ['lb', 'tabs'], ['b', 'close']],
  });
}

// ---------- video (Jellyfin) ----------

function jfItems(list) {
  return (list || []).map((v) => ({ ...v, kind: 'jf', appid: v.id, gameId: v.id, lastPlayed: 0, playtime: 0, size: 0 }));
}

async function loadVideo() {
  if (!state.keys || !state.keys.jellyfin) { state.video = null; return; }
  const r = await api.jfShelves().catch((e) => ({ error: String(e) }));
  if (r && r.error) { state.video = { error: r.error }; return; }
  state.video = r ? { resume: jfItems(r.resume), nextUp: jfItems(r.nextUp), movies: jfItems(r.movies), shows: jfItems(r.shows) } : null;
}

function videoTile(v, extra = {}) {
  const sub = v.episode ? `${v.series} · ${v.episode}` : v.year ? String(v.year) : '';
  return { key: 'jf:' + v.id + (extra.k || ''), type: 'game', game: v, title: v.name, caption: v.episode ? `${v.series}` : v.name, sub, ...extra };
}

function videoPivot() {
  const v = state.video;
  if (!state.keys || !state.keys.jellyfin) return null;
  if (!v || v.error) {
    return { key: 'video', title: 'video', tiles: flow([{ key: 'video:error', type: 'icon', icon: 'info', label: 'jellyfin', value: v && v.error ? 'could not connect' : 'loading…', title: 'jellyfin', activate: async () => { await loadVideo(); rebuild(); } }]) };
  }
  const tiles = [];
  const cont = v.resume.concat(v.nextUp.filter((n) => !v.resume.some((r) => r.id === n.id)));
  if (cont[0]) tiles.push(videoTile(cont[0], { hero: true, w: 2, h: 2, caption: `continue ${cont[0].episode ? cont[0].series : cont[0].name}` }));
  for (const x of cont.slice(1, 5)) tiles.push(videoTile(x));
  tiles.push({ key: 'video:movies', type: 'icon', icon: 'bigpicture', label: 'movies', value: `${v.movies.length} new`, title: 'movies', activate: () => openLibrary({ title: 'movies', list: v.movies, sort: 0 }) });
  tiles.push({ key: 'video:shows', type: 'icon', icon: 'library', label: 'tv shows', value: `${v.shows.length} new`, title: 'tv shows', activate: () => openLibrary({ title: 'tv shows', list: v.shows, sort: 0 }) });
  for (const x of v.movies.slice(0, 3)) tiles.push(videoTile(x, { k: ':m' }));
  return { key: 'video', title: 'video', tiles: flow(tiles) };
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s2 = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0');
}

function openVideoDetail(v) {
  const root = el('div', 'overlay detail');
  root.append(el('div', 'scrim'));
  const blade = el('div', 'blade');
  root.append(blade);
  root.querySelector('.scrim').addEventListener('click', () => popOverlay());
  const hero = el('div', 'hero');
  hero.append(artEl(v, ['hero', 'portrait']));
  hero.append(el('div', 'logo-text', esc(v.episode ? v.series : v.name)));
  blade.append(hero);
  const body = el('div', 'detail-body');
  const list = el('div', 'menu');
  const info = el('div', 'detail-info');
  body.append(list, info);
  blade.append(body);
  const meta = [v.episode ? `${v.episode} · ${v.name}` : '', v.year, v.runtime ? `${v.runtime} min` : '', v.progress ? `${v.progress}% watched` : ''].filter(Boolean);
  info.innerHTML = `<h1>${esc(v.name)}</h1><ul>${meta.map((m) => `<li>${esc(String(m))}</li>`).join('')}</ul><p class="overview">${esc(v.overview || '')}</p>`;
  const items = [];
  if (v.type === 'Series') {
    items.push({ icon: 'library', label: 'episodes', run: async () => { const eps = jfItems(await api.jfEpisodes(v.id)); if (!eps.length) { toast('no episodes'); return; } openLibrary({ title: v.name, list: eps, sort: 1 }); } });
  } else {
    if (v.position) items.push({ icon: 'play', label: `resume from ${fmtTime(v.position / 1e7)}`, run: () => { popOverlay({ silent: true }); playVideo(v); } });
    items.push({ icon: 'play', label: v.position ? 'play from the start' : 'play', run: () => { popOverlay({ silent: true }); playVideo({ ...v, position: 0 }); } });
  }
  items.push({ icon: 'friends', label: 'open in jellyfin (watch party)', run: () => api.jfOpenWeb(v.id) });
  items.push({ icon: 'library', label: 'back', run: () => popOverlay() });
  const m = menu(items, list);
  pushOverlay({
    el: root,
    handle(a) {
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'a') m.run();
      else if (a === 'b' || a === 'left') popOverlay();
    },
    hints: () => [['a', 'select'], ['b', 'back']],
  });
}

async function playVideo(v) {
  const { default: Hls } = await import('./vendor/hls.mjs');
  music.duck();
  sound.play('launch');
  const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const root = el('div', 'overlay player');
  const video = document.createElement('video');
  video.autoplay = true;
  root.append(video);
  const ui = el('div', 'pl-ui', `<div class="pl-title">${esc(v.episode ? `${v.series} · ${v.episode} · ${v.name}` : v.name)}</div><div class="pl-bar"><i></i></div><div class="pl-time"></div>`);
  root.append(ui);
  const src = `nostalgia://jf/Videos/${v.id}/master.m3u8?MediaSourceId=${v.id}&PlaySessionId=${sid}&DeviceId=nostalgiaconsole&VideoCodec=h264&AudioCodec=aac,mp3&TranscodingMaxAudioChannels=2&SegmentContainer=ts&MinSegments=1&BreakOnNonKeyFrames=True&VideoBitrate=15000000&AudioBitrate=192000`;
  const hls = new Hls({ enableWorker: false, startPosition: v.position ? v.position / 1e7 : -1 });
  hls.loadSource(src);
  hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (_e, d) => {
    console.warn('video error', d.type, d.details, d.response && d.response.code, d.reason || '');
    if (d.fatal) { toast('could not play this video'); stop(); }
  });
  const ticks = () => Math.round(video.currentTime * 1e7);
  const report = (kind) => api.jfReport(kind, { ItemId: v.id, MediaSourceId: v.id, PlaySessionId: sid, PositionTicks: ticks(), IsPaused: video.paused, CanSeek: true, PlayMethod: 'Transcode' });
  video.addEventListener('playing', () => report('start'), { once: true });
  const timer = setInterval(() => report('progress'), 10000);
  let hideAt = Date.now() + 3000;
  const draw = () => {
    if (!root.isConnected) return;
    const d = video.duration || (v.runtime * 60) || 1;
    ui.querySelector('.pl-bar i').style.width = Math.min(100, (video.currentTime / d) * 100) + '%';
    ui.querySelector('.pl-time').textContent = `${fmtTime(video.currentTime)} / ${fmtTime(d)}${video.paused ? ' · paused' : ''}`;
    ui.classList.toggle('hide', !video.paused && Date.now() > hideAt);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    report('stop');
    hls.destroy();
    popOverlay({ silent: true });
    loadVideo().then(() => rebuild());
  }
  pushOverlay({
    player: true,
    el: root,
    handle(a) {
      hideAt = Date.now() + 3000;
      if (a === 'a' || a === 'start') { if (video.paused) video.play(); else video.pause(); }
      else if (a === 'left') video.currentTime = Math.max(0, video.currentTime - 10);
      else if (a === 'right') video.currentTime += 10;
      else if (a === 'lb') video.currentTime = Math.max(0, video.currentTime - 60);
      else if (a === 'rb') video.currentTime += 60;
      else if (a === 'b') stop();
    },
    hints: () => [['a', 'pause'], ['lb', '−1 min'], ['rb', '+1 min'], ['b', 'stop']],
    onClose: () => { if (!stopped) { stopped = true; clearInterval(timer); report('stop'); hls.destroy(); } music.resume(); },
  });
}

// ---------- on-screen keyboard ----------
// Controller typing: D-pad moves, A types, X deletes, Y space, B cancels,
// Start (or the done key) finishes. resolve(null) on cancel.

const KEY_ROWS = {
  abc: ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm._@'],
  sym: ['!#$%&*()+=', '/:;?[]{}~^', '|<>"\',`\'\\', 'QWERTYUIOP'],
};

function openKeyboard({ title, value = '', secret = false, hint = '', onChange = null } = {}) {
  return new Promise((resolve) => {
    sound.play('open');
    let text = value;
    let mode = 'abc';
    let r = 1;
    let c = 0;
    const root = el('div', 'overlay kb');
    root.append(el('div', 'scrim'));
    const panel = el('div', 'kb-panel');
    root.append(panel);
    panel.append(el('div', 'kb-title', esc(title)));
    const field = el('div', 'kb-field');
    panel.append(field);
    if (hint) panel.append(el('div', 'kb-hint', esc(hint)));
    const grid = el('div', 'kb-grid');
    panel.append(grid);
    const specials = [['space', ' '], ['⌫', 'del'], ['abc/#', 'mode'], ['paste', 'paste'], ['done', 'done']];

    function rows() { return [...KEY_ROWS[mode].map((row) => [...row].map((ch) => [ch, ch])), specials]; }
    function draw() {
      field.textContent = secret ? '•'.repeat(text.length) : text;
      field.classList.toggle('empty', !text);
      grid.innerHTML = '';
      rows().forEach((row, ri) => {
        const line = el('div', 'kb-row');
        row.forEach(([label], ci) => {
          const k = el('button', 'kb-key' + (ri === r && ci === c ? ' on' : '') + (ri === rows().length - 1 ? ' wide' : ''), esc(label));
          k.tabIndex = -1;
          k.addEventListener('click', () => { r = ri; c = ci; press(); });
          line.append(k);
        });
        grid.append(line);
      });
      if (onChange) onChange(text);
    }
    async function press() {
      const [, v] = rows()[r][c];
      if (v === 'del') text = text.slice(0, -1);
      else if (v === 'mode') mode = mode === 'abc' ? 'sym' : 'abc';
      else if (v === 'paste') { try { text += (await navigator.clipboard.readText()).trim(); } catch { toast('nothing to paste'); } }
      else if (v === 'done') { finish(true); return; }
      else text += v;
      sound.play('move');
      draw();
    }
    function finish(ok) {
      popOverlay({ silent: !ok });
      if (ok) sound.play('select');
      resolve(ok ? text : null);
    }
    window.addEventListener('keydown', function typing(e) {
      // A physical keyboard types straight in.
      if (!root.isConnected) { window.removeEventListener('keydown', typing, true); return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { text += e.key; draw(); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Backspace') { text = text.slice(0, -1); draw(); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Enter') { finish(true); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Escape') { finish(false); e.stopPropagation(); e.preventDefault(); }
    }, true);
    draw();
    pushOverlay({
      el: root,
      handle(a) {
        const R = rows();
        if (a === 'up') r = Math.max(0, r - 1);
        else if (a === 'down') r = Math.min(R.length - 1, r + 1);
        else if (a === 'left') c = Math.max(0, c - 1);
        else if (a === 'right') c = c + 1;
        else if (a === 'a') { press(); return; }
        else if (a === 'x') { text = text.slice(0, -1); sound.play('back'); }
        else if (a === 'y') text += ' ';
        else if (a === 'start') { finish(true); return; }
        else if (a === 'b') { finish(false); return; }
        else if (a === 'lb' || a === 'rb') mode = mode === 'abc' ? 'sym' : 'abc';
        c = Math.min(c, rows()[r].length - 1);
        if (['up', 'down', 'left', 'right'].includes(a)) sound.play('move');
        draw();
      },
      hints: () => [['a', 'type'], ['x', 'delete'], ['y', 'space'], ['start', 'done'], ['b', 'cancel']],
    });
  });
}

// ---------- profiles / sign in ----------

function profilePic(p) {
  if (p.gamerpic && p.gamerpic !== 'avatar') return `<img alt="" src="nostalgia://gamerpics/${encodeURIComponent(p.gamerpic)}">`;
  return avatarPic(normalizeLook(p.avatarLook), 'head', 160, 'gamerpic-av');
}

function openSignIn({ startup = false } = {}) {
  if (state.overlays.some((o) => o.signIn)) return;
  sound.play('open');
  const profiles = state.settings.profiles.length ? state.settings.profiles : [{ id: '', name: displayName(), gamerpic: state.settings.gamerpic, avatarLook: state.settings.avatarLook }];
  const root = el('div', 'overlay library signin' + (GL ? ' lineup' : ''));
  const panel = el('div', 'lib-panel');
  root.append(panel);
  panel.append(el('div', 'lib-head', `<h1>${startup ? 'who\'s playing?' : 'switch profile'}</h1>`));
  const grid = el('div', GL ? 'si-stage' : 'lib-grid pic-grid');
  const cap = el('div', 'lib-caption');
  panel.append(grid, cap);
  // Settings keep at most 8 profiles.
  const items = [...profiles.map((p) => ({ p })), ...(state.settings.profiles.length < 8 ? [{ add: true }] : [])];
  let i = Math.max(0, profiles.findIndex((p) => p.id === state.settings.profile));
  // With WebGL everyone's avatar stands on one stage, idling, with a name
  // plate under each; otherwise gamerpic cards.
  let lineup = null;
  if (GL) {
    const canvas = document.createElement('canvas');
    canvas.className = 'si-canvas';
    grid.append(canvas);
    lineup = new AvatarLineup(canvas);
    lineup.setLooks(profiles.map((p) => normalizeLook(p.avatarLook)));
    lineup.slots(profiles.map((_, k) => (k + 0.5) / items.length), items.length);
    grid.classList.toggle('many', items.length > 5);
  }
  const cards = items.map((it, k) => {
    const c = GL
      ? el('div', 'si-slot' + (it.add ? ' add' : ''), `${it.add ? `<div class="si-add">${icon('user')}<b>+</b></div>` : ''}<div class="si-plate">${esc(it.add ? 'add profile' : it.p.name)}</div>`)
      : el('div', 'card pic' + (it.add ? ' folder' : ''), it.add ? icon('user', 'pic-ico') : profilePic(it.p));
    if (!GL) c.append(el('div', 'card-name', esc(it.add ? 'add profile' : it.p.name)));
    if (GL && !it.add && it.p.id === state.settings.profile) c.classList.add('current');
    c.addEventListener('click', () => { if (k === i) choose(); else { focus(k); sound.play('move'); } });
    grid.append(c);
    return c;
  });
  if (lineup) lineup.start();
  function focus(n) {
    i = Math.max(0, Math.min(items.length - 1, n));
    cards.forEach((c, k) => c.classList.toggle('focused', k === i));
    if (lineup) lineup.focus(i);
    const it = items[i];
    cap.innerHTML = `<div class="cap-title">${esc(it.add ? 'add profile' : it.p.name)}</div><div class="cap-sub">${it.add ? 'everyone gets their own avatar, gamerpic, pins and theme' : it.p.id === state.settings.profile ? 'signed in' : ''}</div>`;
  }
  async function choose() {
    const it = items[i];
    // Leaving a kid profile (for a grown-up one, or a new one) needs the pin.
    const target = it.add ? null : state.settings.profiles.find((p) => p.id === it.p.id);
    if (state.settings.kid && (it.add || (target && !target.kid && it.p.id !== state.settings.profile)) && !(await askPin())) return;
    if (it.add) {
      const name = await openKeyboard({ title: 'profile name' });
      if (!name) return;
      state.settings = await api.createProfile(name);
    } else if (it.p.id && it.p.id !== state.settings.profile) {
      state.settings = await api.switchProfile(it.p.id);
    }
    sound.play('select');
    applySettings();
    rebuild();
    popOverlay({ silent: true });
    notify('signed in', displayName(), { chime: true });
  }
  pushOverlay({
    el: root,
    signIn: true,
    handle(a) {
      const before = i;
      if (a === 'left' || a === 'up') focus(i - 1);
      else if (a === 'right' || a === 'down') focus(i + 1);
      else if (a === 'a') { choose(); return; }
      else if (a === 'b' && !startup) { popOverlay(); return; }
      if (i !== before) sound.play('move');
    },
    hints: () => (startup ? [['a', 'sign in']] : [['a', 'sign in'], ['b', 'back']]),
    onClose: () => { if (lineup) setTimeout(() => lineup.dispose(), 450); },
  });
  requestAnimationFrame(() => focus(i));
}

// ---------- gamerpic picker ----------

async function openGamerpics() {
  if (state.overlays.some((o) => o.gamerpics)) return;
  sound.play('open');
  const files = await api.gamerpics().catch(() => []);
  const root = el('div', 'overlay library gamerpics');
  const panel = el('div', 'lib-panel');
  root.append(panel);
  panel.append(el('div', 'lib-head', '<h1>change gamerpic</h1>'));
  const grid = el('div', 'lib-grid pic-grid');
  const cap = el('div', 'lib-caption');
  panel.append(grid, cap);

  const user = state.lib.user;
  const items = [
    { id: '', label: 'steam picture', html: user && user.avatar ? `<img alt="" src="nostalgia://art/avatar/${user.steamId64}/img?v=${state.avatarStamp}">` : icon('user', 'pic-ico'), hide: !(user && user.avatar) },
    { id: 'avatar', label: 'my avatar', html: avatarPic(look()) },
    ...files.map((f) => ({ id: f, label: f.replace(/\.[^.]+$/, ''), html: `<img alt="" src="nostalgia://gamerpics/${encodeURIComponent(f)}">` })),
    { id: null, label: 'add pictures…', html: icon('image', 'pic-ico'), folder: true },
  ].filter((it) => !it.hide);

  let i = Math.max(0, items.findIndex((it) => it.id === state.settings.gamerpic));
  const cards = items.map((it, k) => {
    const c = el('div', 'card pic' + (it.folder ? ' folder' : ''), it.html);
    c.addEventListener('click', () => { if (k === i) choose(); else { focus(k); sound.play('move'); } });
    grid.append(c);
    return c;
  });

  function focus(n) {
    i = Math.max(0, Math.min(items.length - 1, n));
    cards.forEach((c, k) => c.classList.toggle('focused', k === i));
    cards[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const it = items[i];
    cap.innerHTML = `<div class="cap-title">${esc(it.label)}</div><div class="cap-sub">${it.folder ? 'put pictures in the gamerpics folder' : it.id === state.settings.gamerpic ? 'your gamerpic now' : ''}</div><div class="cap-count">${i + 1} of ${items.length}</div>`;
  }

  async function choose() {
    const it = items[i];
    if (it.folder) {
      const dir = await api.gamerpicFolder();
      toast(`add pictures to ${dir}, then open this again`);
      return;
    }
    sound.play('select');
    state.settings = await api.setSettings({ gamerpic: it.id });
    renderGamercard();
    rebuild();
    notify('gamerpic changed', displayName(), { chime: true });
    popOverlay({ silent: true });
  }

  function cols() {
    if (cards.length < 2) return 1;
    const top = cards[0].offsetTop;
    const n = cards.findIndex((c) => c.offsetTop !== top);
    return n < 0 ? cards.length : n;
  }

  pushOverlay({
    el: root,
    gamerpics: true,
    handle(a) {
      const c = cols();
      const before = i;
      if (a === 'left') focus(i - 1);
      else if (a === 'right') focus(i + 1);
      else if (a === 'up') focus(i - c);
      else if (a === 'down') focus(i + c);
      else if (a === 'a') { choose(); return; }
      else if (a === 'b') { popOverlay(); return; }
      if (i !== before) sound.play('move');
    },
    hints: () => [['a', 'select'], ['b', 'back']],
  });
  requestAnimationFrame(() => focus(i));
}

// ---------- avatar editor ----------

function openAvatarEditor() {
  if (state.overlays.some((o) => o.avatarEditor)) return;
  sound.play('open');
  const orig = look();
  let cur = { ...orig };
  let cat = 0;

  const root = el('div', 'overlay aved');
  const panel = el('div', 'aved-panel');
  root.append(panel);
  const side = el('div', 'aved-side', '<h1>my avatar</h1>');
  const cats = el('div', 'aved-cats');
  side.append(cats);
  const stage = el('div', 'aved-stage');
  const figure = el('div', 'aved-figure');
  stage.append(el('div', 'aved-floor'), figure);
  const strip = el('div', 'aved-strip');
  const label = el('div', 'aved-label');
  panel.append(side, stage, label, strip);

  let group = '';
  const catEls = PARTS.map((p, k) => {
    if (p.group !== group) { group = p.group; cats.append(el('div', 'aved-group', esc(group))); }
    const b = el('button', 'aved-cat', esc(p.label));
    b.tabIndex = -1;
    b.addEventListener('click', () => { pickCat(k); sound.play('move'); });
    cats.append(b);
    return b;
  });

  function opts(p) { return p.values || p.colors; }

  let view3d = null;
  if (GL) {
    const c = document.createElement('canvas');
    figure.append(c);
    view3d = new AvatarView(c);
    view3d.start();
    let drag = null;
    stage.addEventListener('pointerdown', (e) => { drag = e.clientX; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => { if (drag !== null) { view3d.rotateBy((e.clientX - drag) / 120); drag = e.clientX; } });
    stage.addEventListener('pointerup', () => { drag = null; });
  }

  function drawFigure() {
    if (view3d) {
      view3d.setLook(cur);
      view3d.setView(PARTS[cat].face ? 'bust' : 'full');
      return;
    }
    figure.innerHTML = avatarSvg(cur);
    figure.classList.toggle('face', !!PARTS[cat].face);
  }

  function drawStrip() {
    const p = PARTS[cat];
    const list = opts(p);
    const at = Math.max(0, list.indexOf(cur[p.key]));
    strip.innerHTML = '';
    list.forEach((v, k) => {
      const card = el('div', 'aved-opt' + (k === at ? ' on' : '') + (p.colors ? ' swatch' : ''));
      if (p.colors) card.append(el('i', '', ''));
      else card.innerHTML = avatarPic({ ...cur, [p.key]: v }, p.face ? 'bust' : 'full', 160, 'aved-mini');
      if (p.colors && v === 'default') { card.classList.add('default'); card.querySelector('i').textContent = 'default'; }
      else if (p.colors) card.querySelector('i').style.background = v;
      card.addEventListener('click', () => { choose(k); sound.play('move'); });
      strip.append(card);
    });
    const on = strip.children[at];
    if (on) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    label.innerHTML = `<b>${esc(p.label)}</b><span>${p.colors ? `color ${at + 1} of ${list.length}` : esc(String(list[at]))}</span>`;
  }

  function pickCat(k) {
    cat = (k + PARTS.length) % PARTS.length;
    catEls.forEach((e, i) => e.classList.toggle('focused', i === cat));
    catEls[cat].scrollIntoView({ block: 'nearest' });
    drawFigure();
    drawStrip();
  }

  function choose(k) {
    const p = PARTS[cat];
    const list = opts(p);
    cur = { ...cur, [p.key]: list[(k + list.length) % list.length] };
    drawFigure();
    drawStrip();
  }

  function step(d) {
    const p = PARTS[cat];
    choose(Math.max(0, opts(p).indexOf(cur[p.key])) + d);
    sound.play('move');
  }

  async function save() {
    const changed = JSON.stringify(cur) !== JSON.stringify(orig);
    if (changed) {
      state.settings = await api.setSettings({ avatarLook: cur });
      dressAvatar();
      renderGamercard();
      notify('avatar saved', 'looking good', { chime: true });
    }
    popOverlay({ silent: changed });
    if (changed) setTimeout(wave, 300);
  }

  pickCat(0);
  pushOverlay({
    el: root,
    avatarEditor: true,
    handle(a) {
      if (a === 'up') { pickCat(cat - 1); sound.play('move'); }
      else if (a === 'down') { pickCat(cat + 1); sound.play('move'); }
      else if (a === 'left') step(-1);
      else if (a === 'right') step(1);
      else if ((a === 'lt' || a === 'rt') && view3d) view3d.rotateBy(a === 'lt' ? -0.6 : 0.6);
      else if (a === 'lb') { pickCat(PARTS.findIndex((p) => p.group !== PARTS[cat].group)); sound.play('channel'); }
      else if (a === 'rb') { pickCat(PARTS.findIndex((p) => p.group !== PARTS[cat].group)); sound.play('channel'); }
      else if (a === 'y') { cur = normalizeLook(randomLook()); drawFigure(); drawStrip(); sound.play('select'); if (view3d) view3d.wave(); figure.classList.remove('pop'); void figure.offsetWidth; figure.classList.add('pop'); }
      else if (a === 'x') { cur = { ...orig }; drawFigure(); drawStrip(); sound.play('back'); }
      else if (a === 'a' || a === 'b' || a === 'start') save();
    },
    hints: () => [['a', 'save'], ['y', 'random'], ['x', 'undo changes'], ['lt', 'turn'], ['lb', 'features / style'], ['b', 'save & exit']],
    onClose: () => { if (view3d) { view3d.stop(); view3d.renderer.dispose(); } },
  });
}

// ---------- customize ----------
// A guide-style panel: LB/RB pick a section, left/right (or A) change the
// focused option, and the dashboard behind it updates straight away.

function openCustomize() {
  sound.play('open');
  const root = el('div', 'overlay guide customize');
  root.append(el('div', 'scrim'));
  root.querySelector('.scrim').addEventListener('click', () => popOverlay());
  const panel = el('div', 'guide-panel');
  const tabsEl = el('div', 'guide-tabs');
  const list = el('div', 'menu');
  const info = el('div', 'cz-info');
  panel.append(el('div', 'cz-title', 'customize'), tabsEl, list, info);
  root.append(panel);

  const save = async (patch) => {
    state.settings = await api.setSettings(patch);
    applySettings();
    rebuild();
  };
  const step = (list, v, d) => list[(list.indexOf(v) + d + list.length) % list.length];
  // A cycling option: label, current value, the values it steps through.
  const opt = (icon, label, key, values, fmt = (v) => v, swatch = null, note = '') => ({
    icon, label, note: fmt(state.settings[key]), swatch: swatch && swatch(state.settings[key]), info: note,
    change: (d) => save({ [key]: step(values, state.settings[key], d) }),
  });
  const named = (v) => v || 'theme default';
  const metroOnly = () => ((state.settings.look || 'metro') === 'metro' ? '' : ' (360 metro style only)');
  const tabs = [
    { icon: 'palette', label: 'colors', items: () => [
      opt('grid', 'dashboard style', 'look', Object.keys(LOOK_NAMES), (v) => LOOK_NAMES[v], null, 'the whole home screen: 360 metro, nxe or blades, a cross media bar, channels, modern cards, a tile strip, or retro plus (old-school gloss with modern shortcuts)'),
      opt('palette', 'theme', 'theme', THEMES, (v) => v, null, 'the overall style; colors below go on top of it'),
      opt('grid', 'tile color', 'tileColor', ['', ...Object.keys(TILE_HEX)], named, (v) => TILE_HEX[v] || 'var(--tile)', 'tiles and highlights in every style; theme default keeps each style\'s own colors'),
      opt('image', 'background', 'bgColor', ['', ...Object.keys(BG_HEX)], named, (v) => (BG_HEX[v] ? `linear-gradient(${BG_HEX[v].join(',')})` : 'var(--bg-mid)'), 'the color behind everything, in every style'),
    ] },
    { icon: 'grid', label: 'layout', items: () => [
      opt('grid', 'tile size', 'tileSize', Object.keys(TILE_SIZES), (v) => v, null, 'smaller tiles fit more on the screen at once (every style but channels)'),
      opt('info', 'text size', 'textSize', Object.keys(TEXT_SIZES), (v) => v, null, 'names and captions, in every style'),
      opt('play', 'recent games', 'recentCount', COUNTS.recentCount, (v) => (v ? `${v} on the games tab` : 'none'), null, `how many recent games the games tab and each style\'s recent row show`),
      opt('friends', 'friends shown', 'friendCount', COUNTS.friendCount, (v) => `up to ${v}`, null, 'how many friends the social tab lists'),
      { icon: 'refresh', label: 'cycle home games', note: state.settings.cycleTiles ? 'on' : 'off', info: `the two small game tiles on home change every few seconds${metroOnly()}`, change: () => save({ cycleTiles: !state.settings.cycleTiles }) },
    ] },
    { icon: 'controller', label: 'tabs', items: () => Object.entries(TAB_NAMES).map(([key, label]) => {
      const off = state.settings.hiddenTabs.includes(key);
      return {
        icon: off ? 'mute' : 'grid', label, note: off ? 'hidden' : 'shown', info: 'home and settings always stay',
        change: () => save({ hiddenTabs: off ? state.settings.hiddenTabs.filter((k) => k !== key) : [...state.settings.hiddenTabs, key] }),
      };
    }) },
  ];

  let tab = 0;
  let m = null;
  let items = [];
  function show(t, at = 0) {
    tab = (t + tabs.length) % tabs.length;
    tabsEl.innerHTML = `<span class="btn btn-lb">LB</span>${tabs.map((tb, k) => `<span class="gtab${k === tab ? ' on' : ''}">${icon(tb.icon)}<em>${esc(tb.label)}</em></span>`).join('')}<span class="btn btn-rb">RB</span>`;
    [...tabsEl.querySelectorAll('.gtab')].forEach((e, k) => e.addEventListener('click', () => { sound.play('channel'); show(k); }));
    list.innerHTML = '';
    items = tabs[tab].items().map((it) => ({ ...it, run: () => change(1) }));
    m = menu(items, list, (it) => { info.textContent = it.info || ''; });
    items.forEach((it, k) => {
      if (!it.swatch) return;
      const sw = el('i', 'cz-swatch');
      sw.style.background = it.swatch;
      list.children[k].querySelector('small').before(sw);
    });
    m.set(at);
  }
  async function change(d) {
    const at = m.index();
    sound.play('move');
    await items[at].change(d);
    show(tab, at);
  }
  show(0);

  pushOverlay({
    el: root,
    handle(a) {
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'left') change(-1);
      else if (a === 'right' || a === 'a') change(1);
      else if (a === 'lb' || a === 'rb') { sound.play('channel'); show(tab + (a === 'lb' ? -1 : 1)); }
      else if (a === 'y') {
        sound.play('select');
        save({ tileColor: '', bgColor: '', tileSize: 'large', textSize: 'normal', hiddenTabs: [], recentCount: 6, friendCount: 24, cycleTiles: true })
          .then(() => { show(tab, m.index()); toast('layout and colors reset'); });
      } else if (a === 'b' || a === 'view') popOverlay();
    },
    hints: () => [['a', 'change'], ['lb', 'sections'], ['y', 'reset'], ['b', 'done']],
  });
}

// ---------- controls: help and remapping ----------

// What each action does, for the controls screen.
const ACTION_HELP = [
  ['a', 'select, open'], ['b', 'back, home'], ['x', 'play now'], ['y', 'pin a game'],
  ['lb', 'previous section'], ['rb', 'next section'], ['lt', 'page up'], ['rt', 'page down'],
  ['view', 'guide'], ['start', 'game details'], ['guide', 'guide'],
];
// Standard-mapping button names (Xbox / PlayStation).
const PAD_NAMES = ['A / cross', 'B / circle', 'X / square', 'Y / triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'view / share', 'menu / options',
  'left stick', 'right stick', 'd-pad up', 'd-pad down', 'd-pad left', 'd-pad right', 'home / ps'];

function openControls() {
  sound.play('open');
  const root = el('div', 'overlay guide customize controls');
  root.append(el('div', 'scrim'));
  root.querySelector('.scrim').addEventListener('click', () => popOverlay());
  const panel = el('div', 'guide-panel');
  const list = el('div', 'menu');
  const info = el('div', 'cz-info');
  panel.append(el('div', 'cz-title', 'controls'), list, info);
  root.append(panel);
  let m = null;
  let cancel = null;
  const padName = (i) => (i >= 0 ? PAD_NAMES[i] || `button ${i}` : 'none');
  function show(at = 0) {
    list.innerHTML = '';
    const items = ACTION_HELP.map(([a, what]) => ({
      icon: 'controller', label: `${what}`, note: `${padName(buttonOf(a))} · key ${KEY_NAMES[a] || '–'}`,
      info: 'press a to give this a different controller button; the button it had moves to whatever that one did',
      run: () => listen(a, what),
    }));
    items.push({ icon: 'grid', label: 'move', note: 'd-pad or left stick · arrows / wasd', info: 'moving can\'t be remapped', run: () => {} });
    m = menu(items, list, (it) => { info.textContent = it.info || ''; });
    m.set(at);
  }
  function listen(a, what) {
    info.textContent = `press the controller button for "${what}"… (esc to cancel)`;
    list.children[m.index()].classList.add('listening');
    cancel = captureButton(async (i) => {
      cancel = null;
      const padMap = { ...(state.settings.padMap || {}), [a]: i };
      state.settings = await api.setSettings({ padMap });
      applySettings();
      sound.play('select');
      show(m.index());
      info.textContent = `${what}: ${padName(i)}`;
    });
  }
  show(0);
  pushOverlay({
    el: root,
    handle(a) {
      if (cancel) { if (a === 'b') { cancel(); cancel = null; show(m.index()); } return; }
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'a') m.run();
      else if (a === 'y') {
        api.setSettings({ padMap: {} }).then((v) => { state.settings = v; applySettings(); show(m.index()); toast('controller buttons reset'); });
      } else if (a === 'b' || a === 'view') popOverlay();
    },
    onClose() { if (cancel) cancel(); },
    hints: () => [['a', 'remap'], ['y', 'reset'], ['b', 'done']],
  });
}

// ---------- first-run setup ----------

const LOOK_INFO = {
  metro: 'tiles in pivots you flip through with lb / rb',
  nxe: 'channels of cards in 3d, with your avatar beside them',
  blades: 'one coloured blade per section, a menu on each',
  xmb: 'categories across, items down, over a flowing wave',
  wii: 'pages of rounded channels and a clock bar',
  ps5: 'an icon row over the game\'s own artwork',
  switch: 'big square tiles and round shortcuts',
  retro: 'glossy mid-2000s menus with a jump back in dock',
};

function openSetup() {
  sound.play('open');
  const root = el('div', 'overlay guide customize setup');
  root.append(el('div', 'scrim'));
  const panel = el('div', 'guide-panel');
  const head = el('div', 'cz-title');
  const steps = el('div', 'setup-steps');
  const body = el('div', 'setup-body');
  const list = el('div', 'menu');
  const info = el('div', 'cz-info');
  panel.append(head, steps, body, list, info);
  root.append(panel);

  const save = async (patch) => { state.settings = await api.setSettings(patch); applySettings(); rebuild(); };
  const step = (vals, v, d) => vals[(vals.indexOf(v) + d + vals.length) % vals.length];
  const cycle = (icon, label, key, vals, fmt, note) => ({
    icon, label, note: fmt(state.settings[key]), info: note, change: (d) => save({ [key]: step(vals, state.settings[key], d) }),
  });
  const named = (v) => v || 'style default';
  const ml = state.lib.moonlight;
  const PAGES = [
    { title: 'welcome', text: () => `<b>welcome to nostalgiaconsole</b><p>found ${state.all.length} game${state.all.length === 1 ? '' : 's'}${state.lib.root ? '' : ' (steam was not found)'}${ml && ml.hosts && ml.hosts.length ? ` and ${ml.hosts.length} moonlight host${ml.hosts.length === 1 ? '' : 's'}` : ''}. a few quick choices and you're in; all of them can be changed later in settings.</p>`,
      items: () => [] },
    { title: 'pick a style', text: () => `<b>${esc(LOOK_NAMES[state.settings.look] || '')}</b><p>${esc(LOOK_INFO[state.settings.look] || '')}. it changes behind this panel as you pick.</p>`,
      items: () => [cycle('grid', 'dashboard style', 'look', Object.keys(LOOK_NAMES), (v) => LOOK_NAMES[v], 'left / right to try each one')] },
    { title: 'colors', text: () => '<p>pick an accent and a background, or keep the style\'s own.</p>',
      items: () => [
        cycle('grid', 'tile color', 'tileColor', ['', ...Object.keys(TILE_HEX)], named, 'tiles and highlights'),
        cycle('image', 'background', 'bgColor', ['', ...Object.keys(BG_HEX)], named, 'the color behind everything'),
        cycle('grid', 'tile size', 'tileSize', Object.keys(TILE_SIZES), (v) => v, 'smaller fits more on a screen; huge suits a tv across the room'),
      ] },
    { title: 'you', text: () => `<p>your name shows on the dashboard; your avatar on its tile and in the sign-in lineup.</p>`,
      items: () => [
        { icon: 'user', label: 'name', note: displayName(), info: 'press a to type it', run: async () => { const v = await openKeyboard({ title: 'your name', value: state.settings.gamertag || displayName() }); if (v !== null) { await save({ gamertag: v.trim() }); renderGamercard(); } show(); } },
        { icon: 'user', label: 'my avatar', note: 'customize', info: 'press a to open the avatar editor', run: () => openAvatarEditor() },
      ] },
    { title: 'all set', text: () => `<b>you're all set</b><p>press <i>guide</i> (G or the home button) any time for quick resume, sort and filter, settings and switching profiles. <i>x</i> plays a game straight away; <i>y</i> pins it.</p>`,
      items: () => [] },
  ];
  let page = 0;
  let m = null;
  let items = [];
  function show(at = 0) {
    const pg = PAGES[page];
    head.textContent = 'setup';
    steps.innerHTML = PAGES.map((p, k) => `<span class="${k === page ? 'on' : k < page ? 'done' : ''}">${esc(p.title)}</span>`).join('');
    body.innerHTML = pg.text();
    list.innerHTML = '';
    const last = page === PAGES.length - 1;
    items = pg.items().map((it) => ({ ...it, run: it.run || (() => change(1)) }))
      .concat([{ icon: last ? 'play' : 'play', label: last ? 'start playing' : page === 0 ? 'get started' : 'next', info: page ? 'b goes back a step' : '', run: () => next(1) }]);
    m = menu(items, list, (it) => { info.textContent = it.info || ''; });
    m.set(Math.min(at, items.length - 1));
  }
  async function change(d) {
    const it = items[m.index()];
    if (!it.change) return;
    sound.play('move');
    await it.change(d);
    show(m.index());
  }
  async function next(d) {
    if (page + d >= PAGES.length) { await save({ setupDone: true }); popOverlay(); return; }
    page = Math.max(0, page + d);
    sound.play('channel');
    show(0);
  }
  show(0);
  pushOverlay({
    el: root,
    handle(a) {
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'left' || a === 'right') change(a === 'left' ? -1 : 1);
      else if (a === 'a') m.run();
      else if (a === 'b') { if (page) next(-1); }
      else if (a === 'start') next(PAGES.length);
    },
    onClose() { if (!state.settings.setupDone) api.setSettings({ setupDone: true }).then((v) => { state.settings = v; }); },
    hints: () => [['a', 'select'], ['b', 'back'], ['start', 'skip']],
  });
}

// ---------- background music ----------
// Files from the music folder, shuffled, quietly under the dashboard. It
// fades out for games, streams and videos, and while another window is in
// front.

const music = (() => {
  const audio = new Audio();
  let list = [];
  let i = 0;
  let on = false;
  let fade = null;
  const vol = () => ((state.settings.musicVolume ?? 30) / 100) * 0.6;
  function ramp(to, ms = 1200, then) {
    clearInterval(fade);
    const from = audio.volume;
    const t0 = performance.now();
    fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(fade); if (then) then(); }
    }, 50);
  }
  function next() {
    if (!list.length) return;
    audio.src = 'nostalgia://music/' + encodeURIComponent(list[i++ % list.length]);
    audio.play().catch(() => {});
  }
  audio.addEventListener('ended', next);
  audio.addEventListener('error', () => setTimeout(next, 500));
  return {
    async configure() {
      const want = !!state.settings.music && !CAPTURE;
      if (want && !on) {
        list = (await api.musicList()).sort(() => Math.random() - 0.5);
        if (!list.length) return 0;
        on = true;
        audio.volume = 0;
        next();
        if (document.hasFocus()) ramp(vol());
      } else if (!want && on) {
        on = false;
        ramp(0, 600, () => audio.pause());
      } else if (on) ramp(vol(), 300);
      return list.length;
    },
    duck() { if (on) ramp(0, 800, () => audio.pause()); },
    resume() {
      if (!on || !document.hasFocus() || state.overlays.some((o) => o.player)) return;
      audio.play().catch(() => {});
      ramp(vol());
    },
  };
})();
window.addEventListener('blur', () => music.duck());
window.addEventListener('focus', () => music.resume());

// ---------- small confirm panel ----------

function confirmPanel(title, choices) {
  sound.play('open');
  const root = el('div', 'overlay guide customize confirm');
  root.append(el('div', 'scrim'));
  const panel = el('div', 'guide-panel');
  const list = el('div', 'menu');
  panel.append(el('div', 'cz-title', esc(title)), list);
  root.append(panel);
  const m = menu(choices.concat([{ icon: 'library', label: 'cancel', run: () => popOverlay() }]), list);
  pushOverlay({
    el: root,
    handle(a) {
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'a') m.run();
      else if (a === 'b') popOverlay();
    },
    hints: () => [['a', 'select'], ['b', 'cancel']],
  });
}

function openPower() {
  const act = (what, msg) => () => { closeAll(); toast(msg); setTimeout(() => api.power(what), 600); };
  confirmPanel('power', [
    { icon: 'refresh', label: 'restart steam', run: act('restartSteam', 'restarting steam…') },
    { icon: 'power', label: 'sleep', run: act('sleep', 'going to sleep…') },
    { icon: 'refresh', label: 'restart this pc', run: act('restart', 'restarting…') },
    { icon: 'power', label: 'shut down', run: act('shutdown', 'shutting down…') },
  ]);
}

// ---------- family: kid profiles and the parent pin ----------

// Asks for the parent PIN (when one is set); resolves true when it matches.
async function askPin(title = 'parent pin') {
  if (!(state.keys && state.keys.pin)) return true;
  const v = await openKeyboard({ title, secret: true, hint: 'the 4 to 8 digit pin a parent set' });
  if (v === null) return false;
  const ok = await api.pinCheck(v.trim());
  if (!ok) { sound.play('error'); toast('wrong pin'); }
  return ok;
}

async function openFamily() {
  if (!(await askPin())) return;
  sound.play('open');
  const root = el('div', 'overlay guide customize family');
  root.append(el('div', 'scrim'));
  const panel = el('div', 'guide-panel');
  const list = el('div', 'menu');
  const info = el('div', 'cz-info');
  panel.append(el('div', 'cz-title', 'family'), list, info);
  root.append(panel);
  let m = null;
  const save = async (patch) => { state.settings = await api.setSettings(patch); applySettings(); rebuild(); };
  function show(at = 0) {
    list.innerHTML = '';
    const s2 = state.settings;
    const items = [
      { icon: 'user', label: 'kid profile', note: s2.kid ? 'on' : 'off', info: `${displayName()} sees only the games you allow: no store, settings or quitting. switching profiles asks for the pin.`,
        run: async () => {
          if (!s2.kid && !(state.keys && state.keys.pin)) { toast('set a parent pin first'); return; }
          await save({ kid: !s2.kid }); show(m.index());
        } },
      { icon: 'grid', label: 'allowed games', note: `${s2.allowed.length}`, info: 'pick the games this profile can see and play', run: () => openAllowed() },
      { icon: 'info', label: state.keys && state.keys.pin ? 'change parent pin' : 'set a parent pin', info: '4 to 8 digits; needed to leave a kid profile or change these settings',
        run: async () => {
          const v = await openKeyboard({ title: 'new parent pin (4-8 digits)', secret: true });
          if (v === null) return;
          if (v && !/^\d{4,8}$/.test(v.trim())) { toast('the pin has to be 4 to 8 digits'); return; }
          // askPin already checked the old one to get in here.
          const ok = await api.pinSet(v.trim(), await currentPin());
          state.keys = await api.keys();
          toast(ok ? (v ? 'parent pin saved' : 'parent pin removed') : 'could not change the pin');
          show(m.index());
        } },
    ];
    m = menu(items, list, (it) => { info.textContent = it.info || ''; });
    m.set(at);
  }
  // The old pin, for changing it: asked again only when one is set.
  let pinCache = '';
  async function currentPin() {
    if (!(state.keys && state.keys.pin)) return '';
    if (pinCache) return pinCache;
    const v = await openKeyboard({ title: 'current parent pin', secret: true });
    pinCache = v || '';
    return pinCache;
  }
  show(0);
  pushOverlay({
    el: root,
    handle(a) {
      if (a === 'up') m.move(-1);
      else if (a === 'down') m.move(1);
      else if (a === 'a') m.run();
      else if (a === 'b') popOverlay();
    },
    hints: () => [['a', 'select'], ['b', 'done']],
  });
}

// Tick games on and off for a kid profile.
function openAllowed() {
  sound.play('open');
  const root = el('div', 'overlay library allowed');
  const panel = el('div', 'lib-panel');
  panel.append(el('div', 'lib-head', '<h1>allowed games</h1><span class="ach-count">a ticks a game on or off</span>'));
  const grid = el('div', 'ach-list');
  panel.append(grid);
  root.append(panel);
  const games = sorted(state.everything, 'az').concat(state.lib.moonlight ? indexStreamsAll() : []);
  const rows = games.map((g) => {
    const r = el('div', 'ach');
    grid.append(r);
    return r;
  });
  const paint = () => games.forEach((g, k) => {
    const on = state.settings.allowed.includes(g.id);
    rows[k].classList.toggle('on', on);
    rows[k].innerHTML = `<div class="ach-pic">${icon(on ? 'sparkle' : 'grid')}</div><div class="ach-text"><b>${esc(g.name)}</b><span>${esc(g.kind === 'moonlight' ? `stream · ${g.hostName}` : g.kind === 'retro' ? shortSystem(g.system) : g.kind === 'shortcut' ? 'non-steam' : 'steam')}</span></div><small>${on ? 'allowed' : ''}</small>`;
  });
  paint();
  let i = 0;
  const set = (n) => { i = Math.max(0, Math.min(rows.length - 1, n)); rows.forEach((r, k) => r.classList.toggle('focused', k === i)); if (rows[i]) rows[i].scrollIntoView({ block: 'nearest' }); };
  set(0);
  pushOverlay({
    el: root,
    async handle(a) {
      if (a === 'up' || a === 'down') { set(i + (a === 'up' ? -1 : 1)); sound.play('move'); }
      else if (a === 'lt' || a === 'rt') set(i + (a === 'lt' ? -8 : 8));
      else if (a === 'a' && games[i]) {
        const id = games[i].id;
        const allowed = state.settings.allowed.includes(id) ? state.settings.allowed.filter((x) => x !== id) : [...state.settings.allowed, id];
        state.settings = await api.setSettings({ allowed });
        sound.play('select');
        paint();
        rebuild();
      } else if (a === 'b') popOverlay();
    },
    hints: () => [['a', 'allow'], ['b', 'done']],
  });
}

// Every Moonlight app, even ones a kid profile can't see yet.
function indexStreamsAll() {
  const ml = state.lib.moonlight || { hosts: [] };
  return ml.hosts.flatMap((h) => h.apps.map((a) => ({ id: `moonlight:${h.uuid}:${a.id}`, kind: 'moonlight', name: a.name, hostName: h.name })));
}

// ---------- moonlight: pairing and wake-on-lan setup ----------

async function openPair() {
  const address = await openKeyboard({ title: 'pc to pair (name or ip address)', hint: 'the computer running sunshine, for example 192.168.1.20' });
  if (!address) return;
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  sound.play('open');
  const root = el('div', 'overlay guide customize pairing');
  root.append(el('div', 'scrim'));
  const panel = el('div', 'guide-panel');
  panel.append(el('div', 'cz-title', 'pair a pc'), el('div', 'setup-body', `<b class="pair-pin">${pin}</b><p>on ${esc(address.trim())}, open sunshine's web page (https://localhost:47990 there), go to <i>pin</i>, type this number and press send. waiting for it…</p>`));
  root.append(panel);
  pushOverlay({ el: root, handle(a) { if (a === 'b') popOverlay(); }, hints: () => [['b', 'cancel']] });
  const ok = await api.pair(address.trim(), pin);
  if (state.overlays[state.overlays.length - 1] && state.overlays[state.overlays.length - 1].el === root) popOverlay({ silent: true });
  if (ok) { sound.play('select'); toast(`paired with ${address.trim()}`); state.lib = await api.getLibrary(); rebuild(); }
  else { sound.play('error'); toast('pairing didn\'t finish · check the pin and that sunshine is running'); }
}

async function openWakeSetup() {
  const hosts = (state.lib.moonlight && state.lib.moonlight.hosts) || [];
  if (!hosts.length) { toast('pair a pc in moonlight first'); return; }
  confirmPanel('wake on lan', hosts.map((h) => ({
    icon: 'power', label: h.name, note: (state.settings.wakeMacs || {})[h.uuid] || h.mac || 'address not set',
    run: async () => {
      const v = await openKeyboard({ title: `${h.name}: network (mac) address`, value: (state.settings.wakeMacs || {})[h.uuid] || h.mac || '', hint: 'like 78:20:51:3c:ff:d2 · on windows: getmac /v in a command prompt' });
      if (v === null) return;
      if (v && !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v.trim())) { toast('that doesn\'t look like a mac address'); return; }
      const wakeMacs = { ...(state.settings.wakeMacs || {}) };
      if (v) wakeMacs[h.uuid] = v.trim(); else delete wakeMacs[h.uuid];
      state.settings = await api.setSettings({ wakeMacs });
      popOverlay({ silent: true });
      toast(v ? `${h.name} can be woken before streaming` : 'address removed');
      rebuild();
    },
  })));
}

// ---------- one-press updates ----------

async function offerUpdate(u) {
  confirmPanel(`version ${u.version} is out`, [
    { icon: 'downloads', label: 'download and install', run: async () => {
      closeAll();
      notify('updating', `downloading ${u.version}…`, { chime: false });
      const r = await api.installUpdate();
      if (r && r.ok) notify('updated', 'restarting into the new version', { chime: true });
      else if (r && r.manual) toast(`get ${u.version} from github (this kind of install can't update itself)`);
      else toast(`update failed: ${(r && r.error) || 'unknown error'}`);
    } },
  ]);
}

// ---------- screensaver ----------
// After the chosen minutes without input, game art drifts across the
// screen with the clock. Any input wakes it without acting. It never starts
// while a game is in front (the window has no focus then).

const saver = { el: null, timer: null, idleAt: Date.now(), stop: null };

function noteInput() {
  saver.idleAt = Date.now();
}

function checkIdle() {
  const min = state.settings && state.settings.screensaver;
  if (!min || saver.el || !document.hasFocus() || document.hidden) return;
  if (Date.now() - saver.idleAt >= min * 60e3) startSaver();
}

function startSaver() {
  const pool = state.all.filter((g) => g.kind === 'steam').sort(byRecent).slice(0, 24);
  const box = el('div', 'saver');
  const clock = el('div', 'saver-clock');
  box.append(clock);
  document.body.append(box);
  saver.el = box;
  let k = 0;
  const tick = () => { clock.innerHTML = `<b>${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b><span>${esc(displayName())}</span>`; };
  const slide = () => {
    tick();
    const g = pool.length ? pool[k++ % pool.length] : null;
    const s2 = el('div', 'saver-slide');
    if (g) {
      s2.append(artEl(g, ['hero', 'header', 'portrait']));
      s2.append(el('div', 'saver-name', esc(g.name)));
    }
    // Wander: each slide pans a different way.
    s2.style.setProperty('--dx', `${(k % 2 ? -1 : 1) * 4}%`);
    s2.style.setProperty('--dy', `${((k % 3) - 1) * 2}%`);
    box.append(s2);
    requestAnimationFrame(() => s2.classList.add('in'));
    const old = box.querySelectorAll('.saver-slide');
    if (old.length > 2) old[0].remove();
  };
  slide();
  const id = setInterval(slide, 12000);
  saver.stop = () => clearInterval(id);
  requestAnimationFrame(() => box.classList.add('on'));
  if (state.view && state.view.id === 'metro' && dashAvatar) dashAvatar.stop();
}

// Returns true when the input only woke the screensaver.
function wakeSaver() {
  noteInput();
  if (!saver.el) return false;
  saver.stop();
  const box = saver.el;
  saver.el = null;
  box.classList.remove('on');
  setTimeout(() => box.remove(), 500);
  if (state.view) state.view.layout();
  return true;
}

// ---------- settings / intro ----------

function applySettings() {
  const s = state.settings;
  const b = document.body;
  b.dataset.theme = s.theme;
  const tile = TILE_HEX[s.tileColor];
  const bg = BG_HEX[s.bgColor];
  const vars = {
    '--tile': tile, '--accent': tile, '--accent-2': tile && `color-mix(in srgb, ${tile} 70%, #000)`,
    '--bg-top': bg && bg[0], '--bg-mid': bg && bg[1], '--bg-bot': bg && bg[2],
    // The other dashboard styles keep their own colors unless these are set.
    '--look-accent': tile, '--look-accent-2': tile && `color-mix(in srgb, ${tile} 70%, #000)`,
    '--look-bg1': bg && bg[0], '--look-bg2': bg && bg[1], '--look-bg3': bg && bg[2],
    '--look-text': TEXT_SIZES[s.textSize] || 1,
  };
  for (const [k, v] of Object.entries(vars)) if (v) b.style.setProperty(k, v); else b.style.removeProperty(k);
  b.classList.toggle('custom-bg', !!bg);
  b.classList.toggle('custom-tile', !!tile);
  b.classList.toggle('calm', !!s.reduceMotion);
  b.classList.toggle('contrast', !!s.highContrast);
  b.classList.toggle('lite', !!s.lite);
  b.classList.toggle('kid', !!s.kid);
  setPadMap(s.padMap);
  music.configure();
  b.style.setProperty('--text-scale', (TEXT_SIZES[s.textSize] || 1) * (0.5 + 0.5 * (TILE_SIZES[s.tileSize] || 1)));
  dressAvatar();
  sound.configure(state.settings);
}

function runIntro() {
  const intro = $('#intro');
  intro.hidden = false;
  state.introUntil = Date.now() + 3000;
  requestAnimationFrame(() => intro.classList.add('play'));
  sound.play('intro');
  setTimeout(endIntro, 3000);
}

function endIntro() {
  const intro = $('#intro');
  if (intro.hidden || intro.classList.contains('done')) return;
  state.introUntil = 0;
  intro.classList.add('done');
  setTimeout(() => { intro.hidden = true; }, 700);
}

// ---------- input ----------

function handle(action) {
  if (wakeSaver()) return;
  if (action === 'fullscreen') { api.toggleFullscreen(); return; }
  if (state.introUntil > Date.now()) { endIntro(); return; }
  const top = state.overlays[state.overlays.length - 1];
  if (top) top.handle(action);
  else dashHandle(action);
  renderHints();
}

let wheelAt = 0;
window.addEventListener('wheel', (e) => {
  if (wakeSaver()) return;
  if (state.overlays.length || Date.now() - wheelAt < 220) return;
  wheelAt = Date.now();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (state.view) state.view.handle(d > 0 ? 'rb' : 'lb');
  renderHints();
}, { passive: true });

let idleTimer = null;
window.addEventListener('mousemove', () => {
  wakeSaver();
  document.body.classList.remove('nocursor');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('nocursor'), 2500);
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); handle('b'); });
window.addEventListener('resize', () => { if (state.view) state.view.layout(); });

// ---------- boot ----------

// Renders one avatar for the Moonlight cover (main's --avatar-shot mode).
function avatarShot() {
  document.body.classList.add('avatar-shot');
  const box = el('div', '');
  box.id = 'shot';
  const c = document.createElement('canvas');
  box.append(c);
  document.body.append(box);
  let lookIn = {};
  try { lookIn = JSON.parse(params.get('look') || '{}'); } catch { /* default look */ }
  const v = new AvatarView(c, { animate: false, view: ['head', 'bust'].includes(lookIn.view) ? lookIn.view : 'full' });
  v.setLook(lookIn);
  v.render();
}

async function boot() {
  if (params.has('avatarShot')) { avatarShot(); return; }
  const [lib, settings] = await Promise.all([api.getLibrary(), api.getSettings()]);
  state.lib = lib;
  state.settings = settings;
  state.avatarStamp = Date.now();
  GL = GL_OK && !settings.lite;
  applySettings();
  state.channels = buildChannels();
  state.ch = state.channels.findIndex((c) => c.key === 'home');
  renderView();
  renderGamercard();
  tickClock();
  setInterval(tickClock, 15000);
  api.onLibrary((next) => {
    state.lib = next;
    state.avatarStamp = Date.now();
    rebuild();
  });
  startInput(handle);
  api.soundPack().then((files) => sound.loadPack(files)).then((n) => { state.packCount = n; if (n) rebuild(); }).catch(() => {});
  api.onWelcomeBack(() => { notify('welcome back', displayName(), { chime: true }); });
  api.onNotice(({ title, msg, img }) => notify(title, msg, { img }));
  api.onWeb((d) => { state.web = d; rebuild(); });
  Promise.all([api.keys(), api.web()]).then(([k, w]) => { state.keys = k; state.web = w; rebuild(); loadVideo().then(() => rebuild()); }).catch(() => {});
  $('#avatar').addEventListener('click', () => { if (!state.overlays.length) openAvatarEditor(); });
  if (settings.intro && (!CAPTURE || params.has('intro'))) runIntro();
  if (!settings.setupDone) setTimeout(() => openSetup(), settings.intro && !CAPTURE ? 3100 : 200);
  else if (settings.profiles.length > 1 && !CAPTURE) setTimeout(() => openSignIn({ startup: true }), settings.intro ? 3100 : 200);
  setInterval(checkIdle, 10000);
  if (params.has('screensaver')) setTimeout(startSaver, 300);
  document.body.classList.add('ready');
}

boot();
