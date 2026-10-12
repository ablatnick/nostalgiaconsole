'use strict';

// Moonlight (moonlight-qt) integration: paired hosts and their apps come
// from Moonlight's own settings, refreshed with `moonlight list --csv`, and
// streams start with `moonlight stream <host> <app>`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const ORG = 'Moonlight Game Streaming Project';
const UUID = /^[0-9A-Fa-f-]{8,64}$/;

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function onPath(bin) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, bin);
    if (exists(p)) return p;
  }
  return null;
}

// Returns [command, leadingArgs] or null.
function findBinary() {
  if (process.env.MOONLIGHT_BIN) return [process.env.MOONLIGHT_BIN, []];
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]) {
      const p = base && path.join(base, 'Moonlight Game Streaming', 'Moonlight.exe');
      if (p && exists(p)) return [p, []];
    }
    return null;
  }
  if (process.platform === 'darwin') {
    const p = '/Applications/Moonlight.app/Contents/MacOS/Moonlight';
    return exists(p) ? [p, []] : null;
  }
  for (const bin of ['moonlight-qt', 'moonlight']) {
    const p = onPath(bin);
    if (p) return [p, []];
  }
  if (exists('/snap/bin/moonlight')) return ['/snap/bin/moonlight', []];
  const flatpak = onPath('flatpak');
  if (flatpak) {
    for (const dir of ['/var/lib/flatpak/app/com.moonlight_stream.Moonlight', path.join(os.homedir(), '.local/share/flatpak/app/com.moonlight_stream.Moonlight')]) {
      if (exists(dir)) return [flatpak, ['run', 'com.moonlight_stream.Moonlight']];
    }
  }
  return null;
}

function configFiles() {
  const home = os.homedir();
  return [
    path.join(home, '.config', ORG, 'Moonlight.conf'),
    path.join(home, 'snap/moonlight/current/.config', ORG, 'Moonlight.conf'),
    path.join(home, '.var/app/com.moonlight_stream.Moonlight/config', ORG, 'Moonlight.conf'),
    path.join(home, 'Library/Preferences/com.moonlight-stream.Moonlight.plist'),
  ].filter((p) => p.endsWith('.conf') && exists(p));
}

function unquote(v) {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return v;
}

// Flattens the [hosts] group into { "1\\hostname": "...", ... }.
function readIniHosts(file) {
  const out = {};
  let section = '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) { section = sec[1]; continue; }
    if (section !== 'hosts') continue;
    const eq = line.indexOf('=');
    if (eq > 0) out[line.slice(0, eq)] = unquote(line.slice(eq + 1));
  }
  return out;
}

// QSettings on Windows keeps hosts under HKCU\Software\<org>\Moonlight\hosts\<n>.
function readRegistryHosts() {
  const out = {};
  let text;
  try {
    text = execFileSync('reg', ['query', `HKCU\\Software\\${ORG}\\Moonlight\\hosts`, '/s'], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
  } catch { return out; }
  let prefix = null;
  for (const line of text.split(/\r?\n/)) {
    const key = line.match(/\\hosts((?:\\[^\\]+)*)\s*$/i);
    if (/^HKEY_/i.test(line) && key) { prefix = key[1].replace(/^\\/, ''); continue; }
    const val = line.match(/^\s+(\S+)\s+REG_\w+\s+(.*)$/);
    if (val && prefix !== null) out[(prefix ? prefix + '\\' : '') + val[1]] = val[2].trim();
  }
  return out;
}

function hostsFromFlat(flat) {
  const hosts = new Map();
  for (const [k, v] of Object.entries(flat)) {
    const m = k.split('\\');
    if (!/^\d+$/.test(m[0])) continue;
    const h = hosts.get(m[0]) || { apps: new Map() };
    hosts.set(m[0], h);
    if (m.length === 2) h[m[1]] = v;
    else if (m[1] === 'apps' && /^\d+$/.test(m[2]) && m[3]) {
      const a = h.apps.get(m[2]) || {};
      a[m[3]] = v;
      h.apps.set(m[2], a);
    }
  }
  const list = [];
  for (const h of hosts.values()) {
    if (!h.uuid || !UUID.test(h.uuid)) continue;
    const apps = [...h.apps.values()]
      .filter((a) => a.name && /^\d+$/.test(a.id || '') && a.hidden !== 'true')
      .map((a) => ({ id: a.id, name: a.name }));
    list.push({ uuid: h.uuid, name: h.hostname || h.uuid, apps, online: null });
  }
  return list;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseListCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.findIndex((l) => /^Name\s*,\s*ID\b/i.test(l));
  if (head < 0) return null;
  const cols = parseCsvLine(lines[head]).map((c) => c.toLowerCase());
  const idx = (n) => cols.indexOf(n);
  const apps = [];
  for (const l of lines.slice(head + 1)) {
    const f = parseCsvLine(l);
    const name = f[idx('name')];
    const id = f[idx('id')];
    if (!name || !/^\d+$/.test(id || '')) continue;
    if ((f[idx('hidden')] || '').toLowerCase() === 'true') continue;
    let boxart = null;
    const url = f[idx('boxart url')] || '';
    if (url.startsWith('file://')) {
      try { boxart = decodeURIComponent(new URL(url).pathname).replace(/^\/([A-Za-z]:)/, '$1'); } catch { /* bad url */ }
    }
    apps.push({ id, name, boxart });
  }
  return apps;
}

class Moonlight {
  constructor() {
    this.bin = null;
    this.hosts = [];
    this.boxart = new Map();
    this.lastRefresh = 0;
    this.refreshing = null;
  }

  loadCached() {
    this.bin = findBinary();
    let flat = {};
    if (process.platform === 'win32') flat = readRegistryHosts();
    else for (const f of configFiles()) { try { Object.assign(flat, readIniHosts(f)); } catch { /* unreadable */ } }
    const cached = hostsFromFlat(flat);
    // Keep what a live refresh learned (online state, newer app lists).
    const prev = new Map(this.hosts.map((h) => [h.uuid, h]));
    this.hosts = cached.map((h) => {
      const p = prev.get(h.uuid);
      return p && p.online ? { ...h, apps: p.apps, online: p.online } : h;
    });
  }

  listHost(uuid) {
    return new Promise((resolve) => {
      execFile(this.bin[0], [...this.bin[1], 'list', '--csv', uuid], { timeout: 12000, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout) => {
        resolve(err ? null : parseListCsv(String(stdout)));
      });
    });
  }

  // Asks every paired host for its current apps. Offline hosts keep the
  // apps Moonlight cached.
  refresh(force = false) {
    if (!this.bin || !this.hosts.length) return Promise.resolve(false);
    if (this.refreshing) return this.refreshing;
    if (!force && Date.now() - this.lastRefresh < 60000) return Promise.resolve(false);
    this.lastRefresh = Date.now();
    this.refreshing = Promise.all(this.hosts.map(async (h) => {
      const apps = await this.listHost(h.uuid);
      if (!apps) { h.online = false; return; }
      h.online = true;
      h.apps = apps.map(({ id, name }) => ({ id, name }));
      for (const a of apps) {
        if (a.boxart && /\.(png|jpe?g)$/i.test(a.boxart) && a.boxart.split(path.sep).includes('boxart')) {
          this.boxart.set(h.uuid + '/' + a.id, a.boxart);
        }
      }
    })).then(() => true).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  boxartPath(uuid, appId) {
    const p = this.boxart.get(uuid + '/' + appId);
    return p && exists(p) ? p : null;
  }

  summary() {
    return {
      installed: !!this.bin,
      hosts: this.hosts.map((h) => ({
        uuid: h.uuid,
        name: h.name,
        online: h.online,
        apps: h.apps.map((a) => ({ ...a, boxart: !!this.boxartPath(h.uuid, a.id) })),
      })),
    };
  }

  stream(uuid, appId) {
    if (!this.bin) throw new Error('Moonlight is not installed');
    const host = this.hosts.find((h) => h.uuid === uuid);
    const app = host && host.apps.find((a) => a.id === String(appId));
    if (!app) throw new Error('Unknown Moonlight host or app');
    const child = spawn(this.bin[0], [...this.bin[1], 'stream', host.uuid, app.name], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {});
    child.unref();
    return { host: host.name, app: app.name };
  }

  openApp() {
    if (!this.bin) throw new Error('Moonlight is not installed');
    const child = spawn(this.bin[0], this.bin[1], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  }
}

module.exports = { Moonlight, parseListCsv, hostsFromFlat, readIniHosts };
