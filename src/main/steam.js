'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const vdf = require('./vdf');

const STEAMID64_BASE = 76561197960265728n;

// Runtimes, Proton builds and redistributables that show up as "installed
// apps" but are not games.
const TOOL_APPIDS = new Set([
  '228980', '1070560', '1391110', '1628350', '4183110', '1493710', '2180100',
  '1887720', '2348590', '2805730', '1580130', '1420170', '1245040', '961940',
  '930400', '858280', '1161040', '1054830', '1113280', '1826330', '2230260',
  '250820', '1009850', '323910', '243750',
]);
const TOOL_NAME = /^(proton\b|steam linux runtime|steamworks common|steamvr\b|steam audio|steam controller configs|steamworks sdk redist|source sdk)/i;

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readText(p) {
  try { return vdf.parseText(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function windowsSteamPath() {
  for (const key of ['HKCU\\Software\\Valve\\Steam', 'HKLM\\Software\\WOW6432Node\\Valve\\Steam']) {
    try {
      const out = execFileSync('reg', ['query', key, '/v', key.startsWith('HKCU') ? 'SteamPath' : 'InstallPath'],
        { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      const m = out.match(/REG_SZ\s+(.+)\s*$/m);
      if (m) return path.normalize(m[1].trim());
    } catch { /* not installed under this key */ }
  }
  return null;
}

function candidateRoots() {
  const home = os.homedir();
  const list = [];
  if (process.env.STEAM_ROOT) list.push(process.env.STEAM_ROOT);
  if (process.platform === 'win32') {
    const reg = windowsSteamPath();
    if (reg) list.push(reg);
    list.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  } else if (process.platform === 'darwin') {
    list.push(path.join(home, 'Library/Application Support/Steam'));
  } else {
    list.push(
      path.join(home, '.steam/steam'),
      path.join(home, '.local/share/Steam'),
      path.join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
      path.join(home, 'snap/steam/common/.local/share/Steam'),
      path.join(home, '.steam/root'),
    );
  }
  return list;
}

// Several candidates are usually symlinks to the same folder; prefer the one
// with the most recently written login file, so a stale old install loses.
function findSteamRoot(override) {
  if (override) return exists(override) ? path.resolve(override) : null;
  const seen = new Map();
  for (const c of candidateRoots()) {
    if (!exists(path.join(c, 'steamapps'))) continue;
    let real;
    try { real = fs.realpathSync(c); } catch { continue; }
    if (seen.has(real)) continue;
    let mtime = 0;
    try { mtime = fs.statSync(path.join(real, 'config/loginusers.vdf')).mtimeMs; } catch { /* fresh install */ }
    seen.set(real, mtime);
  }
  let best = null;
  for (const [p, m] of seen) if (!best || m > best.m) best = { p, m };
  return best ? best.p : null;
}

function libraryPaths(root) {
  const paths = [root];
  const data = readText(path.join(root, 'steamapps/libraryfolders.vdf'))
    || readText(path.join(root, 'config/libraryfolders.vdf'));
  const folders = data && data.libraryfolders;
  if (folders) {
    for (const [k, v] of Object.entries(folders)) {
      if (!/^\d+$/.test(k)) continue;
      const p = typeof v === 'string' ? v : v && v.path;
      if (p) paths.push(p.replace(/\\\\/g, '\\'));
    }
  }
  const out = [];
  const seen = new Set();
  for (const p of paths) {
    let real;
    try { real = fs.realpathSync(p); } catch { continue; }
    if (!seen.has(real)) { seen.add(real); out.push(real); }
  }
  return out;
}

function currentUser(root) {
  const data = readText(path.join(root, 'config/loginusers.vdf'));
  const users = (data && data.users) || {};
  let pick = null;
  for (const [id, u] of Object.entries(users)) {
    if (!/^\d+$/.test(id)) continue;
    const score = (u.mostrecent === '1' ? 1e12 : 0) + Number(u.timestamp || 0);
    if (!pick || score > pick.score) pick = { id, u, score };
  }
  if (!pick) {
    // No login file: fall back to the only userdata folder, if there is one.
    let dirs = [];
    try { dirs = fs.readdirSync(path.join(root, 'userdata')).filter((d) => /^\d+$/.test(d) && d !== '0'); } catch { /* none */ }
    if (dirs.length !== 1) return null;
    return { name: '', steamId64: (BigInt(dirs[0]) + STEAMID64_BASE).toString(), accountId: dirs[0] };
  }
  return {
    name: pick.u.personaname || '',
    steamId64: pick.id,
    accountId: (BigInt(pick.id) - STEAMID64_BASE).toString(),
  };
}

function localStats(root, user) {
  const stats = {};
  if (!user) return stats;
  const data = readText(path.join(root, 'userdata', user.accountId, 'config/localconfig.vdf'));
  const apps = data && data.userlocalconfigstore && data.userlocalconfigstore.software
    && data.userlocalconfigstore.software.valve && data.userlocalconfigstore.software.valve.steam
    && data.userlocalconfigstore.software.valve.steam.apps;
  if (!apps) return stats;
  for (const [id, a] of Object.entries(apps)) {
    if (a && typeof a === 'object') {
      stats[id] = { lastPlayed: Number(a.lastplayed || 0), playtime: Number(a.playtime || 0) };
    }
  }
  return stats;
}

function shortcutGameId(appid32) {
  return ((BigInt(appid32 >>> 0) << 32n) | 0x02000000n).toString();
}

function readShortcuts(root, user) {
  if (!user) return [];
  let data;
  try {
    data = vdf.parseBinary(fs.readFileSync(path.join(root, 'userdata', user.accountId, 'config/shortcuts.vdf')));
  } catch { return []; }
  const list = (data && data.shortcuts) || {};
  const out = [];
  for (const s of Object.values(list)) {
    if (!s || typeof s !== 'object' || typeof s.appid !== 'number') continue;
    const name = s.appname || s.appName || '';
    if (!name || s.ishidden === 1) continue;
    const appid = s.appid >>> 0;
    out.push({
      id: 'shortcut:' + appid,
      kind: 'shortcut',
      appid: String(appid),
      gameId: shortcutGameId(s.appid),
      name,
      exe: s.exe || '',
      lastPlayed: Number(s.lastplaytime || 0),
      playtime: 0,
      installed: true,
    });
  }
  return out;
}

function readManifests(libs) {
  const games = new Map();
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      const data = readText(path.join(dir, f));
      const a = data && data.appstate;
      if (!a || !a.appid || games.has(a.appid)) continue;
      const flags = Number(a.stateflags || 0);
      games.set(a.appid, {
        appid: a.appid,
        name: a.name || ('App ' + a.appid),
        flags,
        installed: (flags & 4) !== 0,
        needsUpdate: (flags & 2) !== 0,
        // 1024 = downloading, 1048576 = update queued/running
        downloading: (flags & 1024) !== 0 || (flags & 0x100000) !== 0,
        bytesToDownload: Number(a.bytestodownload || 0),
        bytesDownloaded: Number(a.bytesdownloaded || 0),
        lastPlayed: Number(a.lastplayed || 0),
        size: Number(a.sizeondisk || 0),
        installDir: a.installdir ? path.join(dir, 'common', a.installdir) : '',
        library: lib,
      });
    }
  }
  return games;
}

function isTool(appid, name) {
  return TOOL_APPIDS.has(appid) || TOOL_NAME.test(name);
}

function loadLibrary(rootOverride) {
  const root = findSteamRoot(rootOverride);
  if (!root) return { root: null, user: null, games: [], shortcuts: [], tools: [] };
  const user = currentUser(root);
  const stats = localStats(root, user);
  const libs = libraryPaths(root);
  const games = [];
  const tools = [];
  for (const g of readManifests(libs).values()) {
    const s = stats[g.appid] || {};
    const entry = {
      id: 'steam:' + g.appid,
      kind: 'steam',
      appid: g.appid,
      gameId: g.appid,
      name: g.name,
      installed: g.installed,
      needsUpdate: g.needsUpdate,
      downloading: g.downloading,
      progress: g.downloading && g.bytesToDownload ? Math.min(1, g.bytesDownloaded / g.bytesToDownload) : null,
      lastPlayed: Math.max(g.lastPlayed, s.lastPlayed || 0),
      playtime: s.playtime || 0,
      size: g.size,
      installDir: g.installDir,
    };
    (isTool(g.appid, g.name) ? tools : games).push(entry);
  }
  return { root, user, libraries: libs, games, tools, shortcuts: readShortcuts(root, user) };
}

module.exports = { loadLibrary, findSteamRoot, shortcutGameId, isTool };
