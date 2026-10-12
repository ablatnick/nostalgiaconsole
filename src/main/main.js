'use strict';

const { app, BrowserWindow, ipcMain, protocol, net, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const steam = require('./steam');
const { ArtResolver } = require('./art');
const { openSteam } = require('./launch');
const { Settings } = require('./settings');
const { Moonlight } = require('./moonlight');

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
};
if (arg('user-data')) app.setPath('userData', path.resolve(arg('user-data')));

protocol.registerSchemesAsPrivileged([
  { scheme: 'greenblade', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let settings = null;
let library = null;
const art = new ArtResolver(net);
const moonlight = new Moonlight();
const watchers = [];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json',
};
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' greenblade: data:; media-src 'self'; font-src 'self'; connect-src 'self'";

function avatarFile(id64) {
  return path.join(app.getPath('userData'), 'avatars', id64 + '.jpg');
}

async function serve(request) {
  const url = new URL(request.url);
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
  if (url.host === 'art') {
    const [source, id, kind] = url.pathname.split('/').filter(Boolean);
    if (source === 'avatar' && /^\d+$/.test(id || '')) {
      try {
        return new Response(await fs.promises.readFile(avatarFile(id)), { headers: { 'content-type': 'image/jpeg' } });
      } catch {
        return new Response('not found', { status: 404 });
      }
    }
    if ((source === 'steam' || source === 'shortcut') && id && kind) return art.respond(source, id, kind);
    if (source === 'moonlight' && /^\d+$/.test(kind || '')) {
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
    shortcuts: lib.shortcuts,
    moonlight: moonlight.summary(),
    platform: process.platform,
    steamDeck: process.env.SteamDeck === '1' || fs.existsSync('/etc/steamos-release'),
  };
}

function refresh(push) {
  library = steam.loadLibrary(opts.steamRoot);
  art.setLibrary(library);
  watchLibraries();
  moonlight.loadCached();
  if (push) pushLibrary();
  if (settings.values.moonlight) moonlight.refresh().then((changed) => changed && pushLibrary());
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
    backgroundColor: '#dfe3e6',
    autoHideMenuBar: true,
    title: 'Greenblade',
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
  win.on('focus', () => refreshSoon());
  win.loadURL('greenblade://ui/index.html' + (opts.capture ? '?capture=1' : ''));
  if (opts.capture) runCapture();
}

async function runCapture() {
  const wc = win.webContents;
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

ipcMain.handle('library:get', () => publicLibrary());
ipcMain.handle('library:refresh', () => { refresh(false); return publicLibrary(); });
ipcMain.handle('settings:get', () => settings.values);
ipcMain.handle('settings:set', (_e, patch) => {
  const before = settings.values;
  const next = settings.update(patch);
  if (next.communityAvatar && !before.communityAvatar) fetchAvatar();
  if (next.moonlight && !before.moonlight) moonlight.refresh(true).then(() => pushLibrary());
  return next;
});
ipcMain.handle('steam:open', async (_e, action, id) => {
  if (opts.capture) return 'capture';
  const url = await openSteam(shell, library.root, action, id);
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
ipcMain.handle('app:info', () => ({ version: app.getVersion(), capture: !!opts.capture }));

app.whenReady().then(() => {
  settings = new Settings(app.getPath('userData'));
  protocol.handle('greenblade', serve);
  refresh(false);
  createWindow();
  fetchAvatar();
});

app.on('window-all-closed', () => app.quit());
