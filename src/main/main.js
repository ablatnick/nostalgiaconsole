'use strict';

const { app, BrowserWindow, ipcMain, protocol, net, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const steam = require('./steam');
const { ArtResolver } = require('./art');
const { openSteam } = require('./launch');
const { Settings } = require('./settings');
const { Moonlight } = require('./moonlight');
const { SteamWeb } = require('./steamweb');
const { LocalStats } = require('./localstats');
const { Secrets } = require('./secrets');
const { Jellyfin } = require('./jellyfin');
const { RetroArch } = require('./retroarch');
const { PlayLog } = require('./playlog');
const { AppNames } = require('./appnames');
const { screen } = require('electron');
const { execFile } = require('child_process');
const os = require('os');
const vdf = require('./vdf');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

function arg(name) {
  const hit = process.argv.find((a) => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
}

const opts = {
  steamRoot: arg('steam-root') || undefined,
  capture: arg('capture'),
  keys: arg('keys'),
  size: arg('size'),
  delay: Number(arg('delay') || 2500),
  windowed: !!arg('windowed'),
  avatarShot: arg('avatar-shot'),
  // Screenshots only: canned Steam Web / Jellyfin data (test/web-fixture.json).
  webFixture: arg('web-fixture'),
};
if (arg('user-data')) app.setPath('userData', path.resolve(arg('user-data')));

protocol.registerSchemesAsPrivileged([
  { scheme: 'nostalgia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
let settings = null;
let library = null;
const art = new ArtResolver(net);
let secrets = null;
let steamWeb = null;
let localStats = null;
let jellyfin = null;
const retro = new RetroArch();
let playlog = null;
let appNames = null;
const moonlight = new Moonlight();
const watchers = [];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json',
};
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' nostalgia: data:; media-src 'self' nostalgia: blob:; font-src 'self'; connect-src 'self' nostalgia:";
const SOUND_NAMES = ['move', 'channel', 'select', 'back', 'open', 'close', 'error', 'notify', 'launch', 'intro'];
const SOUND_EXT = { '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac' };

// Gamerpics are pictures the user puts in <user data>/gamerpics.
const MUSIC_EXT = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.wav': 'audio/wav', '.opus': 'audio/ogg' };
const PIC_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
function gamerpics() {
  const dir = path.join(app.getPath('userData'), 'gamerpics');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files.filter((f) => PIC_EXT[path.extname(f).toLowerCase()] && /^[\w .()-]{1,80}$/.test(f)).sort();
}

// A sound pack is a folder of files named after the interface sounds
// (move.wav, select.ogg, ...) in <user data>/sounds.
// Background music: audio files in <userData>/music.
function musicFiles() {
  const dir = path.join(app.getPath('userData'), 'music');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* read-only */ }
  try { return fs.readdirSync(dir).filter((f) => MUSIC_EXT[path.extname(f).toLowerCase()] && /^[^/\\]{1,200}$/.test(f)).sort(); } catch { return []; }
}

function soundPack() {
  const dir = path.join(app.getPath('userData'), 'sounds');
  const out = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const name = path.basename(f, path.extname(f)).toLowerCase();
    if (SOUND_EXT[ext] && SOUND_NAMES.includes(name) && !out[name]) out[name] = f;
  }
  return out;
}

function avatarFile(id64) {
  return path.join(app.getPath('userData'), 'avatars', id64 + '.jpg');
}

// The page (nostalgia://ui) fetches from other nostalgia:// hosts (sounds,
// video), which counts as cross-origin.
async function serve(request) {
  const res = await route(request);
  const headers = new Headers(res.headers);
  headers.set('access-control-allow-origin', 'nostalgia://ui');
  return new Response(res.body, { status: res.status, headers });
}

const friendPics = new Map();
async function route(request) {
  const url = new URL(request.url);
  if (url.host === 'jf') return jellyfin.proxy(url.pathname + url.search);
  if (url.host === 'friend') {
    const id = url.pathname.replace(/^\/+/, '');
    const src = friendPics.get(id);
    if (!src) return new Response('not found', { status: 404 });
    return net.fetch(src);
  }
  if (url.host === 'ui') {
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(RENDERER_DIR, rel);
    if (!file.startsWith(RENDERER_DIR + path.sep)) return new Response('forbidden', { status: 403 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, {
        headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-security-policy': CSP },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }
  if (url.host === 'gamerpics') {
    const name = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!gamerpics().includes(name)) return new Response('not found', { status: 404 });
    return new Response(await fs.promises.readFile(path.join(app.getPath('userData'), 'gamerpics', name)), {
      headers: { 'content-type': PIC_EXT[path.extname(name).toLowerCase()] },
    });
  }
  if (url.host === 'sounds') {
    const name = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = soundPack()[name];
    if (!file) return new Response('not found', { status: 404 });
    const full = path.join(app.getPath('userData'), 'sounds', file);
    return new Response(await fs.promises.readFile(full), { headers: { 'content-type': SOUND_EXT[path.extname(file).toLowerCase()] } });
  }
  if (url.host === 'music') {
    const name = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!musicFiles().includes(name)) return new Response('not found', { status: 404 });
    return new Response(await fs.promises.readFile(path.join(app.getPath('userData'), 'music', name)), { headers: { 'content-type': MUSIC_EXT[path.extname(name).toLowerCase()] } });
  }
  if (url.host === 'ach') {
    // Achievement icons from Steam's CDN: /<appid>/<icon hash>.jpg only.
    const m = url.pathname.match(/^\/(\d+)\/([0-9a-f]{40})\.jpg$/);
    if (!m) return new Response('not found', { status: 404 });
    return net.fetch(`https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${m[1]}/${m[2]}.jpg`);
  }
  if (url.host === 'art') {
    const [source, id, kind] = url.pathname.split('/').filter(Boolean);
    if (source === 'retro' && /^[0-9a-f]{16}$/.test(id || '')) {
      const file = retro.artFile(id, kind);
      if (!file) return new Response('not found', { status: 404 });
      return new Response(await fs.promises.readFile(file), { headers: { 'content-type': 'image/png' } });
    }
    if (source === 'avatar' && /^\d+$/.test(id || '')) {
      try {
        return new Response(await fs.promises.readFile(avatarFile(id)), { headers: { 'content-type': 'image/jpeg' } });
      } catch {
        return new Response('not found', { status: 404 });
      }
    }
    if ((source === 'steam' || source === 'shortcut') && id && kind) return art.respond(source, id, kind);
    if (source === 'moonlight' && /^\d+$/.test(kind || '')) {
      const direct = await moonlight.boxartDirect(id, kind);
      if (direct) return new Response(direct, { headers: { 'content-type': 'image/png' } });
      const file = moonlight.boxartPath(id, kind);
      if (file) {
        return new Response(await fs.promises.readFile(file), {
          headers: { 'content-type': /\.png$/i.test(file) ? 'image/png' : 'image/jpeg' },
        });
      }
    }
  }
  return new Response('not found', { status: 404 });
}

function publicLibrary() {
  const lib = library;
  const user = lib.user ? { ...lib.user, avatar: fs.existsSync(avatarFile(lib.user.steamId64)) } : null;
  return {
    root: lib.root,
    user,
    games: lib.games,
    tools: lib.tools,
    shortcuts: (lib.shortcuts || []).map((g) => playlog.merge(g)),
    retro: retro.list().map((g) => playlog.merge(g)),
    collections: lib.collections || [],
    steamHidden: lib.hidden || [],
    moonlight: moonlight.summary(),
    platform: process.platform,
    steamDeck: process.env.SteamDeck === '1' || fs.existsSync('/etc/steamos-release'),
  };
}

function refresh(push) {
  library = steam.loadLibrary(opts.steamRoot);
  retro.load(library.libraries || []);
  art.setLibrary(library);
  watchLibraries();
  checkDownloads();
  moonlight.loadCached();
  if (push) pushLibrary();
  if (settings.values.moonlight) moonlight.refresh().then((changed) => changed && pushLibrary());
  if (!opts.capture && appNames && library.played && library.played.length) {
    appNames.fill(library.played.map((g) => g.appid)).then((added) => { if (added && win && !win.isDestroyed()) win.webContents.send('web', webData()); });
  }
}

function pushLibrary() {
  if (win && !win.isDestroyed()) win.webContents.send('library', publicLibrary());
}

let refreshTimer = null;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh(true), 1500);
}

function watchLibraries() {
  const dirs = (library.libraries || []).map((l) => path.join(l, 'steamapps'));
  if (library.root && library.user) dirs.push(path.join(library.root, 'userdata', library.user.accountId, 'config'));
  const key = dirs.join('|');
  if (watchers.key === key) return;
  while (watchers.length) watchers.pop().close();
  watchers.key = key;
  for (const d of dirs) {
    try {
      watchers.push(fs.watch(d, (event, file) => {
        if (!file || /\.(acf|vdf)$/.test(file)) refreshSoon();
      }));
    } catch { /* folder vanished or not watchable */ }
  }
}

// Public profile XML gives the avatar without an API key. Private profiles
// just keep the built-in gamerpic.
async function fetchAvatar() {
  const user = library && library.user;
  if (!user || !settings.values.communityAvatar || opts.capture) return;
  const file = avatarFile(user.steamId64);
  try {
    if (Date.now() - fs.statSync(file).mtimeMs < 7 * 86400e3) return;
  } catch { /* not cached yet */ }
  try {
    const res = await net.fetch('https://steamcommunity.com/profiles/' + user.steamId64 + '?xml=1');
    if (!res.ok) return;
    const xml = await res.text();
    const m = xml.match(/<avatarFull><!\[CDATA\[(https:\/\/[^\]]+)\]\]><\/avatarFull>/);
    if (!m || !/^https:\/\/avatars\.(steamstatic|akamai\.steamstatic|cloudflare\.steamstatic)\.com\//.test(m[1])) return;
    const img = await net.fetch(m[1]);
    if (!img.ok) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
    if (win && !win.isDestroyed()) win.webContents.send('library', publicLibrary());
  } catch { /* offline */ }
}

function createWindow() {
  const [w, h] = (typeof opts.size === 'string' ? opts.size : '1280x800').split('x').map(Number);
  const fullscreen = !opts.capture && !opts.windowed && settings.values.fullscreen;
  win = new BrowserWindow({
    width: w || 1280,
    height: h || 800,
    fullscreen,
    show: !opts.capture,
    backgroundColor: opts.avatarShot ? '#00000000' : '#dfe3e6',
    transparent: !!opts.avatarShot,
    autoHideMenuBar: true,
    title: 'NostalgiaConsole',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      offscreen: !!opts.capture,
    },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('focus', () => {
    refreshSoon();
    if (playlog && playlog.back()) pushLibrary();
  });
  win.on('blur', () => { if (playlog) playlog.away(); });
  let query = opts.capture ? '?capture=1' + (arg('intro') ? '&intro=1' : '') + (arg('screensaver') ? '&screensaver=1' : '') : '';
  if (opts.capture && opts.avatarShot) query += '&avatarShot=1&look=' + encodeURIComponent(typeof opts.avatarShot === 'string' ? opts.avatarShot : '{}');
  win.loadURL('nostalgia://ui/index.html' + query);
  if (opts.capture) runCapture();
}

async function runCapture() {
  const wc = win.webContents;
  // Screenshot runs print the page's errors, so failures aren't silent.
  wc.on('console-message', (e, lvl, msg) => { const level = e.level ?? lvl; const text = e.message ?? msg; if (level === 'error' || level === 'warning' || level >= 2) process.stderr.write(`[page ${level}] ${text}\n`); });
  await new Promise((r) => wc.once('did-finish-load', r));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(opts.delay);
  for (const k of typeof opts.keys === 'string' ? opts.keys.split(',').filter(Boolean) : []) {
    if (k.startsWith('wait')) { await wait(Number(k.slice(4)) || 500); continue; }
    wc.sendInputEvent({ type: 'keyDown', keyCode: k });
    wc.sendInputEvent({ type: 'keyUp', keyCode: k });
    await wait(450);
  }
  await wait(1200);
  const img = await wc.capturePage();
  fs.writeFileSync(path.resolve(opts.capture), img.toPNG());
  app.exit(0);
}

// ---------- Steam Web API ----------

let fixture = null;
function webFixture() {
  if (!opts.capture || typeof opts.webFixture !== 'string') return null;
  if (!fixture) fixture = JSON.parse(fs.readFileSync(path.resolve(opts.webFixture), 'utf8'));
  return fixture;
}

// Games Steam keeps an achievement list for on this machine.
function localStatGames() {
  if (!library || !library.root) return [];
  try {
    return fs.readdirSync(path.join(library.root, 'appcache', 'stats')).map((f) => (f.match(/^UserGameStatsSchema_(\d+)\.bin$/) || [])[1]).filter(Boolean);
  } catch { return []; }
}

// Local achievements, merged with the Web API's when there is a key (the
// API also knows games never played on this machine).
function achievementSummary() {
  const user = library && library.user;
  const local = user ? localStats.summary(library.root, user.accountId, localStatGames()) : { perGame: {} };
  const api = secrets.status().steam ? steamWeb.summary() : { perGame: {} };
  const perGame = { ...local.perGame };
  for (const [id, g] of Object.entries(api.perGame)) if (!perGame[id] || g.unlocked > perGame[id].unlocked) perGame[id] = g;
  let unlocked = 0;
  let total = 0;
  for (const g of Object.values(perGame)) { unlocked += g.unlocked; total += g.total; }
  return { gamerscore: unlocked * 10, unlocked, total, perGame };
}

function webData() {
  if (webFixture()) return webFixture().web;
  const owned = steamWeb.cache.owned ? steamWeb.cache.owned.games : [];
  const installed = new Set((library.games || []).filter((g) => g.installed).map((g) => g.appid));
  const user = library && library.user;
  const apiPeople = secrets.status().steam && steamWeb.cache.friends ? steamWeb.cache.friends.people : null;
  const people = apiPeople || (user ? localStats.friends(library.root, user.accountId) : []);
  for (const p of people) if (/^https:\/\/avatars\.(steamstatic|akamai\.steamstatic|cloudflare\.steamstatic)\.com\//.test(p.avatar)) friendPics.set(p.steamid, p.avatar);
  return {
    enabled: true,
    keyed: secrets.status().steam,
    // With a key: everything owned. Without: games played on this account
    // that aren't installed here, once the store has told us their names.
    notInstalled: secrets.status().steam
      ? owned.filter((g) => !installed.has(g.appid) && !steam.isTool(g.appid, g.name))
      : (library.played || []).map((g) => ({ ...g, name: appNames && appNames.get(g.appid) })).filter((g) => g.name && !steam.isTool(g.appid, g.name)),
    achievements: achievementSummary(),
    friends: people.map((p) => ({ ...p, avatar: friendPics.has(p.steamid) ? `nostalgia://friend/${p.steamid}` : '' })),
  };
}

let webBusy = false;
async function refreshWeb(force = false) {
  const key = secrets.get('steamApiKey');
  const user = library && library.user;
  if (!user || webBusy || opts.capture) return webData();
  if (!key) {
    // No key: friends' online status from their public profiles.
    webBusy = true;
    try { await localStats.refreshStatus(localStats.friends(library.root, user.accountId)); } catch { /* offline */ }
    webBusy = false;
    const data = webData();
    friendAlerts(data.friends);
    if (win && !win.isDestroyed()) win.webContents.send('web', data);
    return data;
  }
  webBusy = true;
  try {
    const stale = (x, ms) => force || !x || Date.now() - x.at > ms;
    if (stale(steamWeb.cache.owned, 6 * 3600e3)) await steamWeb.owned(key, user.steamId64);
    if (stale(steamWeb.cache.friends, 5 * 60e3)) await steamWeb.friends(key, user.steamId64).catch(() => {});
    const played = (steamWeb.cache.owned ? steamWeb.cache.owned.games : []).filter((g) => g.playtime > 0).sort((a, b) => b.lastPlayed - a.lastPlayed).map((g) => g.appid);
    await steamWeb.refreshAchievements(key, user.steamId64, played, { maxAge: force ? 0 : 6 * 3600e3 });
  } catch (e) {
    if (e.code === 'badkey') sendNotice('steam rejected the api key', 'check it in settings');
  } finally {
    webBusy = false;
  }
  const data = webData();
  friendAlerts(data.friends);
  if (win && !win.isDestroyed()) win.webContents.send('web', data);
  return data;
}

// Pop-ups when a friend comes online or starts a game. The first check
// after start-up only records who is on, so it never floods.
let lastFriends = null;
function friendAlerts(friends) {
  const now = new Map((friends || []).map((f) => [f.steamid, f]));
  const before = lastFriends;
  lastFriends = now;
  if (!before || !settings.values.friendAlerts) return;
  const news = [];
  for (const [id, f] of now) {
    const was = before.get(id);
    if (!was) continue;
    if (f.game && f.game !== was.game) news.push([f, 'friend in game', `${f.name} is playing ${f.game}`]);
    else if (f.state > 0 && !(was.state > 0)) news.push([f, 'friend online', `${f.name} is online`]);
  }
  if (news.length > 3) { sendNotice('friends online', `${news.length} friends came online`); return; }
  news.forEach(([f, title, msg], i) => setTimeout(() => sendNotice(title, msg, f.avatar || null), i * 6500));
}

// ---------- notifications over games ----------
// A small always-on-top window, so pop-ups show while a game has the
// screen (achievements, downloads). The dashboard shows its own when it is
// in front.

let overlay = null;
function overlayWindow() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  const d = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({
    width: 640, height: 130, x: Math.round(d.x + (d.width - 640) / 2), y: Math.round(d.y + d.height - 200),
    transparent: true, frame: false, resizable: false, focusable: false, skipTaskbar: true, show: false,
    alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.loadURL('nostalgia://ui/notify.html');
  return overlay;
}

function sendNotice(title, msg, img = null) {
  if (opts.capture) return;
  if (win && !win.isDestroyed() && win.isFocused()) {
    win.webContents.send('notice', { title, msg, img });
    return;
  }
  const o = overlayWindow();
  const show = () => { o.showInactive(); o.webContents.send('notice', { title, msg, img }); setTimeout(() => { if (!o.isDestroyed()) o.hide(); }, 6000); };
  if (o.webContents.isLoading()) o.webContents.once('did-finish-load', show); else show();
}

// While a game runs, check its achievements every minute.
let achTimer = null;
function watchAchievements(appid) {
  clearInterval(achTimer);
  const key = secrets.get('steamApiKey');
  const user = library && library.user;
  if (!user || !/^\d+$/.test(String(appid)) || String(appid).length > 10) return;
  if (!key) {
    // Watch Steam's local stats file for this game; it is rewritten when
    // an achievement unlocks.
    const id = String(appid);
    let seen = new Set(localStats.unlocked(library.root, user.accountId, id).keys());
    let at = localStats.statsFileTime(library.root, user.accountId, id);
    let started = false;
    achTimer = setInterval(async () => {
      const running = await runningAppId();
      if (running) started = true;
      else if (started) { clearInterval(achTimer); return; }
      const t = localStats.statsFileTime(library.root, user.accountId, id);
      if (t === at) return;
      at = t;
      const g = localStats.game(library.root, user.accountId, id);
      if (!g) return;
      for (const a of g.unlocked) if (!seen.has(a.key)) sendNotice('achievement unlocked', `${a.name} · 10G`);
      seen = new Set(g.unlocked.map((a) => a.key));
      if (win && !win.isDestroyed()) win.webContents.send('web', webData());
    }, 10e3);
    return;
  }
  steamWeb.newUnlocks(key, user.steamId64, String(appid)).catch(() => {});
  achTimer = setInterval(async () => {
    const running = await runningAppId();
    if (!running) { clearInterval(achTimer); return; }
    try {
      for (const a of await steamWeb.newUnlocks(key, user.steamId64, String(appid))) sendNotice('achievement unlocked', `${a.name} · 10G`);
    } catch { /* offline */ }
  }, 60e3);
}

// Downloads: notice when a game that was downloading becomes installed.
let lastDownloads = new Map();
function checkDownloads() {
  const now = new Map((library.games || []).map((g) => [g.appid, g]));
  for (const [id, before] of lastDownloads) {
    const g = now.get(id);
    if (before.downloading && g && !g.downloading && g.installed) sendNotice(before.installed ? 'update finished' : 'download complete', g.name);
  }
  lastDownloads = new Map([...now].map(([id, g]) => [id, { downloading: g.downloading, installed: g.installed }]));
}

// ---------- updates and start at login ----------

async function checkUpdate() {
  try {
    const res = await net.fetch('https://api.github.com/repos/ablatnick/nostalgiaconsole/releases/latest', { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) return null; // private repo or no releases yet
    const r = await res.json();
    const latest = String(r.tag_name || '').replace(/^v/, '');
    const newer = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
    if (latest && newer(latest, app.getVersion())) return { version: latest, url: r.html_url };
  } catch { /* offline */ }
  return null;
}

// ---------- power and one-press updates ----------

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (err) => resolve(!err));
  });
}

async function power(what) {
  if (opts.capture) return 'capture';
  const win32 = process.platform === 'win32';
  if (what === 'restartSteam') {
    if (win32) await run(path.join(library.root || 'C:\\Program Files (x86)\\Steam', 'steam.exe'), ['-shutdown']);
    else {
      const { linuxCommand } = require('./launch');
      const cmd = linuxCommand(library.root, '-shutdown');
      if (cmd) await run(cmd[0], cmd[1]);
    }
    // Steam takes a few seconds to let go; then start it again.
    setTimeout(() => openSteam(shell, library.root, 'library').catch(() => {}), 9000);
    return 'ok';
  }
  const cmds = win32 ? {
    sleep: ['powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)']],
    restart: ['shutdown', ['/r', '/t', '0']],
    shutdown: ['shutdown', ['/s', '/t', '0']],
  } : {
    sleep: ['systemctl', ['suspend']],
    restart: ['systemctl', ['reboot']],
    shutdown: ['systemctl', ['poweroff']],
  };
  const c = cmds[what];
  if (!c) return 'unknown';
  return (await run(c[0], c[1])) ? 'ok' : 'failed';
}

// Downloads the new release for this kind of install, checks it against
// the sha256 GitHub publishes for it, and swaps it in. Progress goes to the
// renderer as 'update-progress' (0..1).
let updating = false;
async function installUpdate() {
  if (opts.capture || updating) return { error: 'busy' };
  const send = (p) => { if (win && !win.isDestroyed()) win.webContents.send('update-progress', p); };
  let rel;
  try {
    const res = await net.fetch('https://api.github.com/repos/ablatnick/nostalgiaconsole/releases/latest', { headers: { accept: 'application/vnd.github+json' } });
    rel = await res.json();
  } catch { return { error: 'offline' }; }
  const assets = rel.assets || [];
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  const appImage = process.env.APPIMAGE;
  const pick = process.platform === 'win32'
    ? assets.find((a) => (portable ? /-portable\.exe$/ : /Setup.*\.exe$/).test(a.name))
    : appImage ? assets.find((a) => /\.AppImage$/.test(a.name)) : null;
  if (!pick) return { manual: rel.html_url };
  updating = true;
  try {
    const res = await net.fetch(pick.browser_download_url);
    if (!res.ok) return { error: `download failed (${res.status})` };
    const total = Number(res.headers.get('content-length')) || pick.size || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      got += value.length;
      if (total) send(got / total);
    }
    const buf = Buffer.concat(chunks);
    const want = String(pick.digest || '').replace(/^sha256:/, '');
    const have = require('crypto').createHash('sha256').update(buf).digest('hex');
    if (want && want !== have) return { error: 'the download did not match its checksum' };
    if (process.platform === 'win32') {
      const dest = portable
        ? path.join(path.dirname(portable), pick.name)
        : path.join(os.tmpdir(), pick.name);
      fs.writeFileSync(dest, buf);
      // The installer closes us, installs silently and starts the new
      // version (--force-run); a portable build just starts the new file.
      const { spawn } = require('child_process');
      spawn(dest, portable ? [] : ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => app.quit(), 800);
      return { ok: rel.tag_name };
    }
    const tmp = appImage + '.new';
    fs.writeFileSync(tmp, buf, { mode: 0o755 });
    fs.renameSync(tmp, appImage);
    app.relaunch({ execPath: appImage });
    setTimeout(() => app.exit(0), 500);
    return { ok: rel.tag_name };
  } catch (e) {
    return { error: e.message };
  } finally {
    updating = false;
  }
}

function applyAutostart(on) {
  if (opts.capture) return;
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: !!on });
    return;
  }
  const file = path.join(os.homedir(), '.config/autostart/nostalgiaconsole.desktop');
  const exe = process.env.APPIMAGE || process.execPath;
  if (on) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=NostalgiaConsole\nExec="${exe}"\nX-GNOME-Autostart-enabled=true\n`);
  } else {
    try { fs.unlinkSync(file); } catch { /* not there */ }
  }
}

ipcMain.handle('library:get', () => publicLibrary());
ipcMain.handle('keys:status', () => (webFixture() ? { steam: true, jellyfin: true, jellyfinUrl: 'http://jellyfin.test' } : secrets.status()));
ipcMain.handle('profile:create', (_e, name) => settings.createProfile(name));
ipcMain.handle('profile:switch', (_e, id) => settings.switchProfile(String(id)));
ipcMain.handle('profile:remove', (_e, id) => settings.removeProfile(String(id)));
ipcMain.handle('keys:set', async (_e, patch) => {
  secrets.set(patch || {});
  jellyfin.userId = null;
  if (patch && 'steamApiKey' in patch) refreshWeb(true);
  return secrets.status();
});
ipcMain.handle('web:get', () => webData());
ipcMain.handle('web:refresh', () => refreshWeb(true));
ipcMain.handle('jf:shelves', async () => {
  if (webFixture()) return webFixture().video;
  if (!jellyfin.configured()) return null;
  try { return await jellyfin.shelves(settings.values.jellyfinUser); } catch (e) { return { error: e.message }; }
});
ipcMain.handle('achievements:get', (_e, appid) => {
  if (!/^\d+$/.test(String(appid))) return null;
  if (webFixture()) {
    const g = (webFixture().web.achievements.perGame || {})[appid];
    if (!g) return null;
    return Array.from({ length: g.total }, (_, i) => ({ name: `achievement ${i + 1}`, desc: i < g.unlocked ? 'unlocked in the test library' : 'not yet', icon: '', unlocked: i < g.unlocked, at: i < g.unlocked ? Math.floor(Date.now() / 1000) - i * 86400 : 0 }));
  }
  const user = library && library.user;
  return user ? localStats.details(library.root, user.accountId, String(appid)) : null;
});
ipcMain.handle('retro:launch', (_e, id) => {
  if (opts.capture || !/^[0-9a-f]{16}$/.test(String(id))) return null;
  const name = retro.launch(String(id));
  playlog.start('retro:' + id);
  watchGame();
  return name;
});
// Wake-on-LAN, then wait (up to 90 s) for the host to answer.
ipcMain.handle('moonlight:wake', async (_e, uuid) => {
  if (opts.capture) return 'capture';
  const mac = (settings.values.wakeMacs || {})[uuid];
  if (await moonlight.reachable(uuid)) return 'awake';
  try { await moonlight.wake(uuid, mac); } catch (e) { return 'nomac'; }
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (await moonlight.reachable(uuid)) return 'woke';
    if (i % 5 === 4) try { await moonlight.wake(uuid, mac); } catch { /* keep waiting */ }
  }
  return 'timeout';
});
ipcMain.handle('moonlight:reachable', (_e, uuid) => moonlight.reachable(String(uuid)));
ipcMain.handle('moonlight:pair', async (_e, address, pin) => {
  if (opts.capture) return false;
  const ok = await moonlight.pair(String(address), String(pin)).catch(() => false);
  if (ok) { moonlight.loadCached(); await moonlight.refresh(true).catch(() => {}); pushLibrary(); }
  return ok;
});
ipcMain.handle('power:act', (_e, what) => power(String(what)));
ipcMain.handle('music:list', () => musicFiles());
ipcMain.handle('music:folder', async () => {
  const dir = path.join(app.getPath('userData'), 'music');
  fs.mkdirSync(dir, { recursive: true });
  if (!opts.capture) await shell.openPath(dir);
  return dir;
});
ipcMain.handle('pin:check', (_e, pin) => !secrets.get('parentPin') || String(pin) === secrets.get('parentPin'));
ipcMain.handle('pin:set', (_e, pin, old) => {
  if (secrets.get('parentPin') && String(old) !== secrets.get('parentPin')) return false;
  secrets.set({ parentPin: String(pin || '') });
  return true;
});
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('jf:users', async () => { try { return await jellyfin.users(); } catch { return []; } });
ipcMain.handle('jf:episodes', (_e, id) => (/^[\w-]+$/.test(String(id)) ? jellyfin.episodes(String(id)) : []));
ipcMain.handle('jf:report', (_e, kind, body) => jellyfin.report(kind, body));
ipcMain.handle('jf:openWeb', (_e, id) => {
  if (!jellyfin.configured() || !/^[\w-]+$/.test(String(id))) return;
  const w = new BrowserWindow({ fullscreen: true, autoHideMenuBar: true, backgroundColor: '#000', webPreferences: { contextIsolation: true, sandbox: true } });
  w.loadURL(jellyfin.webUrl(String(id)));
});
ipcMain.handle('update:check', () => checkUpdate());
ipcMain.handle('library:refresh', () => { refresh(false); return publicLibrary(); });
ipcMain.handle('settings:get', () => settings.values);
ipcMain.handle('settings:set', (_e, patch) => {
  const before = settings.values;
  const next = settings.update(patch);
  if (next.communityAvatar && !before.communityAvatar) fetchAvatar();
  if (next.moonlight && !before.moonlight) moonlight.refresh(true).then(() => pushLibrary());
  if (next.autostart !== before.autostart) applyAutostart(next.autostart);
  return next;
});
// Steam's "running game" value: the registry on Windows, registry.vdf
// elsewhere. 0 means no game is running.
function runningAppId() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'], { windowsHide: true, timeout: 4000 }, (err, out) => {
        const m = !err && String(out).match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i);
        resolve(m ? parseInt(m[1], 16) : null);
      });
      return;
    }
    for (const p of [path.join(os.homedir(), '.steam/registry.vdf'), path.join(os.homedir(), '.var/app/com.valvesoftware.Steam/.steam/registry.vdf'), path.join(os.homedir(), 'snap/steam/common/.steam/registry.vdf')]) {
      try {
        const r = vdf.parseText(fs.readFileSync(p, 'utf8'));
        const v = r.registry.hkcu.software.valve.steam.runningappid;
        if (v !== undefined) { resolve(Number(v) || 0); return; }
      } catch { /* try the next location */ }
    }
    resolve(null);
  });
}

// After a launch, wait for the game to start and then to exit, and come
// back to the front (Steam otherwise leaves Big Picture or its own
// window on top).
let watchTimer = null;
function watchGame() {
  clearInterval(watchTimer);
  const started = Date.now();
  let seen = false;
  watchTimer = setInterval(async () => {
    const id = await runningAppId();
    if (id === null) { clearInterval(watchTimer); return; }
    if (id) { seen = true; return; }
    if (!seen) {
      if (Date.now() - started > 5 * 60e3) clearInterval(watchTimer);
      return;
    }
    clearInterval(watchTimer);
    openSteam(shell, library.root, 'closebigpicture').catch(() => {});
    setTimeout(comeBack, 1500);
  }, 2500);
}

function comeBack() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
  win.focus();
  if (settings.values.fullscreen && !win.isFullScreen()) win.setFullScreen(true);
  setTimeout(() => { if (win && !win.isDestroyed()) win.setAlwaysOnTop(false); }, 2000);
  win.webContents.send('welcome-back');
}

ipcMain.handle('steam:open', async (_e, action, id) => {
  if (opts.capture) return 'capture';
  const url = await openSteam(shell, library.root, action, id);
  if (action === 'run') {
    watchGame();
    watchAchievements(id);
    const sc = (library.shortcuts || []).find((g) => g.gameId === String(id));
    if (sc) playlog.start(sc.id);
  }
  if (action === 'run' && win) {
    const after = settings.values.afterLaunch;
    if (after === 'minimize') setTimeout(() => win && !win.isDestroyed() && win.minimize(), 1500);
    if (after === 'close') setTimeout(() => app.quit(), 2500);
  }
  return url;
});
ipcMain.handle('moonlight:stream', (_e, uuid, appId) => {
  if (opts.capture) return 'capture';
  const started = moonlight.stream(String(uuid), String(appId));
  const after = settings.values.afterLaunch;
  if (after === 'minimize') setTimeout(() => win && !win.isDestroyed() && win.minimize(), 1500);
  if (after === 'close') setTimeout(() => app.quit(), 2500);
  return started;
});
ipcMain.handle('moonlight:open', () => { if (!opts.capture) moonlight.openApp(); });
ipcMain.handle('moonlight:refresh', async () => {
  moonlight.loadCached();
  await moonlight.refresh(true);
  return publicLibrary();
});
ipcMain.handle('window:fullscreen', () => {
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('sounds:pack', () => soundPack());
ipcMain.handle('gamerpics:list', () => gamerpics());
ipcMain.handle('gamerpics:folder', async () => {
  const dir = path.join(app.getPath('userData'), 'gamerpics');
  fs.mkdirSync(dir, { recursive: true });
  if (!opts.capture) await shell.openPath(dir);
  return dir;
});
ipcMain.handle('sounds:folder', async () => {
  const dir = path.join(app.getPath('userData'), 'sounds');
  fs.mkdirSync(dir, { recursive: true });
  if (!opts.capture) await shell.openPath(dir);
  return dir;
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), capture: !!opts.capture }));

// The app used to be called Greenblade; carry its settings (and the avatar
// saved in them) over the first time NostalgiaConsole starts.
function migrateOldSettings() {
  const dest = path.join(app.getPath('userData'), 'settings.json');
  const old = path.join(app.getPath('appData'), 'Greenblade', 'settings.json');
  if (opts.capture || fs.existsSync(dest) || !fs.existsSync(old)) return;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(old, dest);
  } catch { /* start fresh */ }
}

app.whenReady().then(() => {
  migrateOldSettings();
  settings = new Settings(app.getPath('userData'));
  secrets = new Secrets(app.getPath('userData'));
  steamWeb = new SteamWeb(net, app.getPath('userData'));
  localStats = new LocalStats(net);
  jellyfin = new Jellyfin(net, secrets);
  playlog = new PlayLog(app.getPath('userData'));
  appNames = new AppNames(net, app.getPath('userData'));
  protocol.handle('nostalgia', serve);
  refresh(false);
  createWindow();
  fetchAvatar();
  if (!opts.capture) {
    setTimeout(() => refreshWeb(), 2500);
    setInterval(() => refreshWeb(), 5 * 60e3);
  }
});

app.on('window-all-closed', () => app.quit());
