import { startInput } from './input.js';
import * as sound from './sound.js';
import { icon } from './icons.js';
import { avatarSvg, PARTS, VIEW_HEAD, VIEW_FULL, normalizeLook, randomLook } from './avatar.js';
import { AvatarView, snapshot, webglAvailable } from './avatar3d.js';

// 3D avatars when WebGL works, the flat drawing otherwise.
const GL = webglAvailable();
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
const AFTER_LAUNCH = ['stay', 'minimize', 'close'];
const VOLUMES = [20, 40, 60, 80, 100];
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

function indexLibrary() {
  const { lib, settings } = state;
  const steamGames = lib.games.filter((g) => g.installed)
    .concat(settings.showTools ? lib.tools.filter((t) => t.installed) : []);
  state.steamGames = steamGames;
  state.all = steamGames.concat(lib.shortcuts);
  const ml = lib.moonlight || { hosts: [] };
  state.streams = settings.moonlight ? ml.hosts.flatMap((h) => h.apps.map((a) => ({
    id: `moonlight:${h.uuid}:${a.id}`, kind: 'moonlight', host: h.uuid, hostName: h.name, online: h.online,
    appid: a.id, name: a.name, boxart: a.boxart, lastPlayed: 0, playtime: 0,
  }))) : [];
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
  const set = (patch, msg) => async () => {
    state.settings = await api.setSettings(patch);
    applySettings();
    rebuild();
    if (msg) toast(msg);
  };
  const next = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  return [
    { key: 'set:theme', type: 'icon', icon: 'palette', label: 'theme', value: s.theme, title: 'theme', sub: 'change the dashboard colors', colors: ['#7d58c6', '#46297f'], activate: set({ theme: next(THEMES, s.theme) }) },
    { key: 'set:avatar-edit', type: 'avatar', label: 'my avatar', value: 'customize', title: 'my avatar', sub: 'change your avatar\'s features and style', activate: () => openAvatarEditor() },
    { key: 'set:avatar-show', type: 'icon', icon: 'user', label: 'avatar on spotlight', value: onoff(s.avatar), title: 'show avatar', sub: 'your avatar stands on the spotlight channel', colors: ['#5aa51e', '#2f6f0c'], activate: set({ avatar: !s.avatar }) },
    { key: 'set:sound', type: 'icon', icon: s.sound ? 'sound' : 'mute', label: 'sounds', value: onoff(s.sound), title: 'interface sounds', sub: 'blips and swooshes while you browse', colors: ['#2c8fd6', '#155988'], activate: set({ sound: !s.sound }) },
    { key: 'set:volume', type: 'icon', icon: 'volume', label: 'volume', value: `${s.volume}%`, title: 'sound volume', sub: 'loudness of the interface sounds', colors: ['#1aa3a3', '#0d6464'], activate: set({ volume: VOLUMES[(VOLUMES.indexOf(s.volume) + 1) % VOLUMES.length] || 60 }) },
    { key: 'set:intro', type: 'icon', icon: 'sparkle', label: 'startup intro', value: onoff(s.intro), title: 'startup intro', sub: 'play the boot animation when nostalgiaconsole opens', colors: ['#d9a400', '#8d6900'], activate: set({ intro: !s.intro }) },
    { key: 'set:fullscreen', type: 'icon', icon: 'fullscreen', label: 'full screen', value: onoff(s.fullscreen), title: 'full screen', sub: 'start in full screen (F11 switches any time)', colors: ['#4c6b80', '#28404f'],
      activate: async () => {
        const fs = await api.toggleFullscreen();
        await set({ fullscreen: fs })();
      } },
    { key: 'set:after', type: 'icon', icon: 'rocket', label: 'after launch', value: s.afterLaunch, title: 'after a game starts', sub: 'stay open, minimize, or close nostalgiaconsole', colors: ['#e0632a', '#93330b'], activate: set({ afterLaunch: next(AFTER_LAUNCH, s.afterLaunch) }) },
    { key: 'set:tools', type: 'icon', icon: 'wrench', label: 'steam tools', value: s.showTools ? 'shown' : 'hidden', title: 'steam tools', sub: `proton, runtimes and redistributables (${state.lib.tools.length} installed)`, colors: ['#6d7a84', '#3d474e'], activate: set({ showTools: !s.showTools }) },
    { key: 'set:moonlight', type: 'icon', icon: 'stream', label: 'moonlight', value: onoff(s.moonlight), title: 'moonlight streaming', sub: (state.lib.moonlight && state.lib.moonlight.installed) ? 'show apps from your paired moonlight hosts' : 'moonlight is not installed on this device', colors: ['#4b3fa0', '#221a5c'], activate: set({ moonlight: !s.moonlight }) },
    { key: 'set:avatar', type: 'icon', icon: 'user', label: 'profile picture', value: onoff(s.communityAvatar), title: 'profile picture', sub: 'use your steam community avatar (public profiles)', colors: ['#3a9d55', '#1d5e2f'], activate: set({ communityAvatar: !s.communityAvatar }) },
    { key: 'set:refresh', type: 'icon', icon: 'refresh', label: 'refresh library', value: '', title: 'refresh library', sub: state.lib.root ? `reading ${state.lib.root}` : 'steam folder not found', colors: ['#5aa51e', '#2f6f0c'],
      activate: async () => {
        state.lib = await api.refreshLibrary();
        rebuild();
        toast(`library refreshed · ${state.all.length} games`);
      } },
    { key: 'set:quit', type: 'icon', icon: 'power', label: 'quit', value: '', title: 'quit nostalgiaconsole', sub: state.lib.steamDeck ? 'back to steam' : 'close the dashboard', colors: ['#c4282d', '#7a1115'], activate: () => api.quit() },
  ];
}

function steamTiles() {
  const u = state.lib.user;
  const tiles = [];
  if (u) {
    tiles.push({
      key: 'steam:profile', type: 'profile', title: displayName(), sub: 'your steam profile',
      activate: () => openSteam('profile', u.steamId64),
    });
  }
  const t = (key, ico, label, sub, colors, action) => ({ key: 'steam:' + key, type: 'icon', icon: ico, label, value: '', title: label, sub, colors, activate: () => openSteam(action) });
  tiles.push(
    t('store', 'store', 'store', 'browse the steam store', ['#1b6fb5', '#0b3a66'], 'storefront'),
    t('friends', 'friends', 'friends', 'friends and chat', ['#2a9c6c', '#11573a'], 'friends'),
    t('downloads', 'downloads', 'downloads', 'installs and updates in progress', ['#5b6bd0', '#2c367d'], 'downloads'),
    t('library', 'library', 'steam library', 'open the full steam library', ['#4e5f6c', '#27323a'], 'library'),
    t('bigpicture', 'bigpicture', 'big picture', 'switch to steam big picture mode', ['#2f3c45', '#11181d'], 'bigpicture'),
    t('settings', 'gear', 'steam settings', 'steam client settings', ['#6c7880', '#394146'], 'settings'),
  );
  return tiles;
}

function buildChannels() {
  indexLibrary();
  const { settings, lib } = state;
  const pinned = settings.pinned.map((id) => state.byId.get(id)).filter(Boolean);
  const recent = state.all.filter((g) => g.lastPlayed > 0 && !isPinned(g)).sort(byRecent);
  let spot = pinned.concat(recent).slice(0, 8);
  if (!spot.length) spot = sorted(state.all, 'az').slice(0, 6);
  const channels = [];

  const spotTiles = spot.map((g, i) => (g.kind === 'moonlight' ? streamTile(g) : gameTile(g, { hero: i === 0 })));
  if (state.all.length) spotTiles.push(libraryTile());
  else {
    spotTiles.push({
      key: 'empty', type: 'icon', icon: 'controller', label: 'no games yet', value: '',
      title: lib.root ? 'no installed games found' : 'steam was not found',
      sub: lib.root ? 'install a game in steam and it shows up here' : 'install steam, or start nostalgiaconsole with --steam-root=<folder>',
      colors: ['#6d7a84', '#3d474e'], activate: () => openSteam('storefront'),
    });
  }
  channels.push({ key: 'spotlight', title: 'spotlight', tiles: spotTiles });

  if (state.steamGames.length) {
    const mine = sorted(state.steamGames, 'recent').slice(0, 30).map((g) => gameTile(g));
    mine.push(libraryTile());
    channels.push({ key: 'games', title: 'my games', tiles: mine });
  }
  if (lib.shortcuts.length) {
    channels.push({ key: 'apps', title: 'apps & emulators', tiles: sorted(lib.shortcuts, 'recent').map((g) => gameTile(g)) });
  }
  const streaming = streamingChannel();
  if (streaming) channels.push(streaming);
  channels.push({ key: 'steam', title: 'my steam', tiles: steamTiles() });
  channels.push({ key: 'settings', title: 'settings', tiles: settingTiles() });
  return channels;
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
  sound.play('launch');
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

function tileEl(t) {
  const e = el('div', `tile t-${t.type}`);
  e.dataset.key = t.key;
  if (t.type === 'stream' && t.game.boxart) {
    e.append(artEl(t.game, ['boxart']));
    e.append(el('div', 'badge kind', 'stream'));
    if (isPinned(t.game)) e.append(el('div', 'badge pin', icon('pin')));
  } else if (t.type === 'stream') {
    e.style.setProperty('--c1', t.colors[0]);
    e.style.setProperty('--c2', t.colors[1]);
    e.innerHTML = `${icon(t.icon, 'tile-ico')}<div class="tile-label"><b>${esc(t.title)}</b><span>${esc(t.game.hostName)}</span></div>`;
    e.append(el('div', 'badge kind', 'stream'));
    if (isPinned(t.game)) e.append(el('div', 'badge pin', icon('pin')));
  } else if (t.type === 'game') {
    e.append(artEl(t.game, ['header', 'portrait']));
    if (isPinned(t.game)) e.append(el('div', 'badge pin', icon('pin')));
    if (t.game.kind === 'shortcut') e.append(el('div', 'badge kind', 'app'));
  } else if (t.type === 'avatar') {
    e.style.setProperty('--c1', '#9fd85f');
    e.style.setProperty('--c2', '#3f8f0e');
    e.append(el('div', 'avatar-tile', avatarPic(look(), 'full', 256)));
    e.append(el('div', 'tile-label', `<b>${esc(t.label)}</b><span>${esc(t.value)}</span>`));
  } else if (t.type === 'profile') {
    const u = state.lib.user;
    e.style.setProperty('--c1', '#3d4a52');
    e.style.setProperty('--c2', '#1b2328');
    e.append(el('div', 'profile-pic', ''));
    fillGamerpic($('.profile-pic', e), u);
    e.append(el('div', 'tile-label', `<b>${esc(displayName())}</b><span>${gamesLine()}</span>`));
  } else {
    e.style.setProperty('--c1', t.colors[0]);
    e.style.setProperty('--c2', t.colors[1]);
    e.innerHTML = `${icon(t.icon, 'tile-ico')}<div class="tile-label"><b>${esc(t.label)}</b>${t.value ? `<span>${esc(t.value)}</span>` : ''}</div>`;
  }
  e.append(el('div', 'gloss'));
  return e;
}

function gamesLine() {
  const n = state.all.length;
  return `${n} game${n === 1 ? '' : 's'} · ${totalHours()} hrs`;
}

function totalHours() {
  return Math.round(state.all.reduce((n, g) => n + (g.playtime || 0), 0) / 60);
}

function renderDash() {
  dash.innerHTML = '';
  state.channels.forEach((ch, ci) => {
    const sec = el('section', 'channel');
    sec.dataset.i = ci;
    sec.append(el('h2', 'ch-title', esc(ch.title)));
    const row = el('div', 'row');
    ch.tiles.forEach((t, ti) => {
      const te = tileEl(t);
      te.addEventListener('click', () => clickTile(ci, ti));
      row.append(te);
    });
    sec.append(row, el('div', 'caption'));
    dash.append(sec);
  });
  layout();
}

function clickTile(ci, ti) {
  if (state.overlays.length) return;
  if (ci === state.ch && focusIndex(state.channels[ci]) === ti) { activateTile(); return; }
  state.ch = ci;
  state.focus[state.channels[ci].key] = ti;
  sound.play('move');
  layout();
}

function metrics() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = Math.max(220, Math.min(vw * 0.34, vh * 0.6, 640));
  const th = tw * 9 / 16;
  return { vw, vh, tw, th, x0: Math.max(40, vw * 0.09), top: Math.max(150, vh * 0.25) };
}

// compact: the spotlight row makes room for the avatar on the right.
function tilePlacement(d, m, compact = false) {
  if (d === 0) return { x: m.x0, y: 0, s: 1, o: 1, z: 100 };
  if (d < 0) return { x: m.x0 - (m.tw + 60) * -d, y: 0, s: 1, o: 0, z: 100 + d };
  const step = compact ? 0.44 : 0.6;
  const last = compact ? 4 : 6;
  let x = m.x0 + m.tw + 34;
  let s = 0.66;
  for (let k = 1; k < d; k++) {
    x += m.tw * s * step;
    s *= 0.84;
  }
  return { x, y: (m.th - m.th * s) / 2 - d * 5, s, o: d > last ? 0 : 1 - (d - 1) * 0.13, z: 100 - d };
}

function avatarShown() {
  const ch = state.channels[state.ch];
  return state.settings.avatar && ch && ch.key === 'spotlight' && !state.overlays.length;
}

function placeAvatar(m) {
  const av = $('#avatar');
  const h = Math.min(m.vh * 0.46, m.th * 1.7);
  const w = h / 2;
  av.style.height = h + 'px';
  av.style.width = w + 'px';
  av.style.left = (m.vw - w - Math.max(24, m.vw * 0.035)) + 'px';
  av.style.top = (m.top + m.th + 64 - h) + 'px';
  av.classList.toggle('show', avatarShown());
  if (dashAvatar) { if (avatarShown()) dashAvatar.start(); else dashAvatar.stop(); }
}

function look() {
  return normalizeLook(state.settings.avatarLook);
}

function dressAvatar() {
  if (GL) {
    if (!dashAvatar) {
      const c = document.createElement('canvas');
      $('#avatar').replaceChildren(c);
      dashAvatar = new AvatarView(c);
    }
    dashAvatar.setLook(look());
  } else {
    $('#avatar').innerHTML = avatarSvg(look());
  }
  for (const e of document.querySelectorAll('.tile .avatar-tile')) e.innerHTML = avatarPic(look(), 'full', 256);
}

function wave() {
  if (dashAvatar) { dashAvatar.wave(); return; }
  const av = $('#avatar');
  av.classList.remove('wave');
  void av.offsetWidth;
  av.classList.add('wave');
  setTimeout(() => av.classList.remove('wave'), 1900);
}

function layout() {
  const m = metrics();
  dash.style.setProperty('--tw', m.tw + 'px');
  dash.style.setProperty('--th', m.th + 'px');
  dash.style.setProperty('--x0', m.x0 + 'px');
  const nextY = m.top + m.th + Math.max(130, m.vh * 0.19);
  [...dash.children].forEach((sec, ci) => {
    const ch = state.channels[ci];
    const rel = ci - state.ch;
    let y; let s; let o;
    if (rel === 0) { y = m.top; s = 1; o = 1; }
    else if (rel < 0) { y = m.top - m.th - 160; s = 0.8; o = 0; }
    else if (rel === 1) { y = nextY; s = 0.45; o = 0.62; }
    else { y = nextY + m.th * 0.45 + 40 + (rel - 2) * 36; s = 0.45; o = y > m.vh - 120 ? 0 : 0.5; }
    sec.style.transform = `translate3d(0, ${y}px, 0) scale(${s})`;
    sec.style.opacity = o;
    sec.classList.toggle('current', rel === 0);
    sec.classList.toggle('far', rel >= 2);
    sec.classList.toggle('gone', rel < 0);
    const fi = focusIndex(ch);
    const compact = state.settings.avatar && ch.key === 'spotlight';
    [...sec.querySelector('.row').children].forEach((te, ti) => {
      const p = tilePlacement(ti - fi, m, compact);
      te.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.s})`;
      te.style.opacity = p.o;
      te.style.zIndex = p.z;
      te.classList.toggle('focused', ti === fi);
    });
    const t = ch.tiles[fi];
    const cap = sec.querySelector('.caption');
    cap.innerHTML = t ? `<div class="cap-title">${esc(t.title)}</div><div class="cap-sub">${esc(t.sub || '')}</div>` : '';
  });
  placeAvatar(m);
  renderHints();
}

function currentTile() {
  const ch = state.channels[state.ch];
  return ch && ch.tiles[focusIndex(ch)];
}

function activateTile() {
  const t = currentTile();
  if (!t) return;
  if (t.type === 'game') { sound.play('open'); openDetail(t.game); return; }
  if (t.type === 'stream') { startStream(t.game); return; }
  sound.play('select');
  t.activate();
}

function moveFocus(delta) {
  const ch = state.channels[state.ch];
  const i = focusIndex(ch);
  const n = Math.max(0, Math.min(ch.tiles.length - 1, i + delta));
  if (n === i) return false;
  state.focus[ch.key] = n;
  sound.play('move');
  layout();
  return true;
}

function moveChannel(delta) {
  const n = Math.max(0, Math.min(state.channels.length - 1, state.ch + delta));
  if (n === state.ch) return;
  state.ch = n;
  sound.play('channel');
  layout();
}

function dashHandle(a) {
  const t = currentTile();
  switch (a) {
    case 'left': moveFocus(-1); break;
    case 'right': moveFocus(1); break;
    case 'up': moveChannel(-1); break;
    case 'down': moveChannel(1); break;
    case 'lb': moveFocus(-5); break;
    case 'rb': moveFocus(5); break;
    case 'lt': moveFocus(-999); break;
    case 'rt': moveFocus(999); break;
    case 'a': activateTile(); break;
    case 'x': if (t && t.type === 'game') launch(t.game); else if (t && t.type === 'stream') startStream(t.game); break;
    case 'y': if (t && (t.type === 'game' || t.type === 'stream')) togglePin(t.game); else if (state.all.length) { sound.play('open'); openLibrary(); } break;
    case 'b':
      if (state.ch !== 0 || focusIndex(state.channels[0]) !== 0) {
        state.ch = 0;
        state.focus[state.channels[0].key] = 0;
        sound.play('back');
        layout();
      }
      break;
    case 'start': if (t && t.type === 'game') { sound.play('open'); openDetail(t.game); } else openGuide(); break;
    case 'view': case 'guide': openGuide(); break;
    default:
  }
}

function dashHints() {
  const t = currentTile();
  const h = [['a', t && t.type === 'game' ? 'details' : t && t.type === 'stream' ? 'stream' : 'select']];
  if (t && t.type === 'game') h.push(['x', 'play'], ['y', isPinned(t.game) ? 'unpin' : 'pin']);
  else if (t && t.type === 'stream') h.push(['y', isPinned(t.game) ? 'unpin' : 'pin']);
  else if (state.all.length) h.push(['y', 'game library']);
  h.push(['view', 'guide']);
  return h;
}

// Keeps focus on the same tile (by key) when channels are rebuilt.
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
  renderDash();
  renderGamercard();
}

// ---------- gamercard / clock ----------

function fillGamerpic(box, user) {
  box.innerHTML = '';
  if (user && user.avatar) {
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
  $('#gamercard .gc-sub').textContent = gamesLine();
  fillGamerpic($('#gamercard .gc-pic'), state.lib.user);
}

function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ---------- hints ----------

function renderHints() {
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

  const meta = [
    g.kind === 'shortcut' ? 'non-steam shortcut' : 'steam game',
    timeAgo(g.lastPlayed),
    hours(g.playtime),
    g.size ? `${bytes(g.size)} on disk` : '',
    g.needsUpdate ? 'update pending' : '',
  ].filter(Boolean);
  info.innerHTML = `<h1>${esc(g.name)}</h1><ul>${meta.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
    + (g.installDir ? `<p class="path">${esc(g.installDir)}</p>` : '');

  const items = [
    { icon: 'play', label: 'play', note: g.needsUpdate ? 'steam updates it first' : '', run: () => { popOverlay({ silent: true }); launch(g); } },
    { icon: 'pin', label: isPinned(g) ? 'unpin from spotlight' : 'pin to spotlight', run: () => { popOverlay({ silent: true }); togglePin(g); } },
  ];
  if (g.kind === 'steam') {
    items.push(
      { icon: 'info', label: 'view in steam', run: () => openSteam('details', g.appid) },
      { icon: 'store', label: 'store page', run: () => openSteam('store', g.appid) },
    );
  }
  items.push({ icon: 'library', label: 'back', run: () => popOverlay() });
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

function openLibrary() {
  const root = el('div', 'overlay library');
  const panel = el('div', 'lib-panel');
  root.append(panel);
  const head = el('div', 'lib-head', '<h1>game library</h1>');
  const tabs = el('div', 'lib-tabs');
  head.append(tabs);
  const grid = el('div', 'lib-grid');
  const cap = el('div', 'lib-caption');
  panel.append(head, grid, cap);

  let sort = 0;
  let i = 0;
  let items = [];
  let cards = [];

  function renderTabs() {
    tabs.innerHTML = `<span class="btn btn-lb">LB</span>${SORTS.map(([, label], k) => `<span class="tab${k === sort ? ' on' : ''}">${label}</span>`).join('')}<span class="btn btn-rb">RB</span>`;
  }

  function renderGrid() {
    const keep = items[i] && items[i].id;
    items = sorted(state.all, SORTS[sort][0]);
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
    const ci = state.channels.findIndex((c) => c.key === key);
    if (ci >= 0) { state.ch = ci; state.focus[key] = 0; layout(); }
  };
  const recent = state.all.filter((g) => g.lastPlayed > 0).sort(byRecent).slice(0, 5);
  const ml = state.lib.moonlight;
  const tabs = [
    { icon: 'controller', label: 'home', items: () => [
      { icon: 'controller', label: 'dashboard home', run: goChannel('spotlight') },
      { icon: 'grid', label: 'game library', note: `${state.all.length}`, run: () => { closeAll(); openLibrary(); } },
      { icon: 'user', label: 'my avatar', run: () => { closeAll(); openAvatarEditor(); } },
      { icon: 'bigpicture', label: 'steam big picture', run: () => { closeAll(); openSteam('bigpicture'); } },
      { icon: 'fullscreen', label: 'toggle full screen', run: () => api.toggleFullscreen() },
      { icon: 'power', label: 'quit nostalgiaconsole', run: () => api.quit() },
    ] },
    { icon: 'play', label: 'games', items: () => [
      ...recent.map((g) => ({ icon: 'play', label: g.name, note: timeAgo(g.lastPlayed).replace('played ', ''), run: () => { closeAll(); launch(g); } })),
      { icon: 'grid', label: 'all games', run: () => { closeAll(); openLibrary(); } },
    ] },
    { icon: 'stream', label: 'streaming', items: () => [
      ...state.streams.map((g) => ({ icon: 'stream', label: g.name, note: g.hostName, run: () => { closeAll(); startStream(g); } })),
      ...(ml && ml.installed ? [{ icon: 'stream', label: 'open moonlight', run: () => { closeAll(); api.openMoonlight(); } }] : []),
      ...(!state.streams.length && !(ml && ml.installed) ? [{ icon: 'info', label: 'moonlight is not installed', run: () => {} }] : []),
    ] },
    { icon: 'gear', label: 'settings', items: () => [
      { icon: 'gear', label: 'dashboard settings', run: goChannel('settings') },
      { icon: 'palette', label: `theme: ${state.settings.theme}`, run: async () => { state.settings = await api.setSettings({ theme: THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length] }); applySettings(); rebuild(); show(tab, m.index()); } },
      { icon: state.settings.sound ? 'sound' : 'mute', label: `sounds: ${state.settings.sound ? 'on' : 'off'}`, run: async () => { state.settings = await api.setSettings({ sound: !state.settings.sound }); applySettings(); show(tab, m.index()); } },
      { icon: 'gear', label: 'steam settings', run: () => { closeAll(); openSteam('settings'); } },
    ] },
  ];

  let tab = 0;
  let m = null;
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
      view3d.setView(PARTS[cat].face ? 'head' : 'full');
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
      else card.innerHTML = avatarPic({ ...cur, [p.key]: v }, p.face ? 'head' : 'full', 160, 'aved-mini');
      if (p.colors) card.querySelector('i').style.background = v;
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

// ---------- settings / intro ----------

function applySettings() {
  document.body.dataset.theme = state.settings.theme;
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
  if (action === 'fullscreen') { api.toggleFullscreen(); return; }
  if (state.introUntil > Date.now()) { endIntro(); return; }
  const top = state.overlays[state.overlays.length - 1];
  if (top) top.handle(action);
  else dashHandle(action);
  renderHints();
}

let wheelAt = 0;
window.addEventListener('wheel', (e) => {
  if (state.overlays.length || Date.now() - wheelAt < 220) return;
  wheelAt = Date.now();
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) moveFocus(e.deltaX > 0 ? 1 : -1);
  else moveChannel(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

let idleTimer = null;
window.addEventListener('mousemove', () => {
  document.body.classList.remove('nocursor');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('nocursor'), 2500);
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); handle('b'); });
window.addEventListener('resize', () => layout());

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
  const v = new AvatarView(c, { animate: false });
  v.setLook(lookIn);
  v.render();
}

async function boot() {
  if (params.has('avatarShot')) { avatarShot(); return; }
  const [lib, settings] = await Promise.all([api.getLibrary(), api.getSettings()]);
  state.lib = lib;
  state.settings = settings;
  state.avatarStamp = Date.now();
  applySettings();
  state.channels = buildChannels();
  renderDash();
  renderGamercard();
  tickClock();
  setInterval(tickClock, 15000);
  api.onLibrary((next) => {
    state.lib = next;
    state.avatarStamp = Date.now();
    rebuild();
  });
  startInput(handle);
  $('#avatar').addEventListener('click', () => { if (!state.overlays.length) openAvatarEditor(); });
  if (settings.intro && (!CAPTURE || params.has('intro'))) runIntro();
  document.body.classList.add('ready');
}

boot();
