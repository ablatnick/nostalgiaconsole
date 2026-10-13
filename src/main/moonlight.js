'use strict';

// Moonlight (moonlight-qt) integration: paired hosts and their apps come
// from Moonlight's own settings, refreshed with `moonlight list --csv`, and
// streams start with `moonlight stream <host> <app>`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');
const https = require('https');
const crypto = require('crypto');

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

// Flattens the [hosts] group into { "1\\hostname": "...", ... }. The
// client certificate from [General] comes back under "_cert"/"_key".
function readIniHosts(file) {
  const out = {};
  let section = '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) { section = sec[1]; continue; }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq);
    if (section === 'General' && (k === 'certificate' || k === 'key')) out['_' + (k === 'certificate' ? 'cert' : 'key')] = byteArray(line.slice(eq + 1));
    if (section !== 'hosts') continue;
    out[k] = k.endsWith('srvcert') ? byteArray(line.slice(eq + 1)) : unquote(line.slice(eq + 1));
  }
  return out;
}

// Qt writes binary settings as @ByteArray(...) with C-style escapes.
function byteArray(v) {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  const m = v.match(/^@ByteArray\((.*)\)$/s);
  if (m) v = m[1];
  return v.replace(/\\(x[0-9a-fA-F]{1,2}|.)/g, (_, e) => (e[0] === 'x' ? String.fromCharCode(parseInt(e.slice(1), 16)) : { n: '\n', r: '\r', t: '\t', 0: '\0' }[e] ?? e));
}

// reg query prints numbers in hex: QSettings saves ints (like app ids) as
// REG_DWORD/REG_QWORD, and strings with a NUL in them as UTF-16 REG_BINARY.
function regValue(type, text) {
  if (type === 'REG_DWORD' || type === 'REG_QWORD') return /^0x[0-9a-f]+$/i.test(text) ? BigInt(text).toString() : text;
  if (type === 'REG_BINARY' && /^([0-9a-f]{2})*$/i.test(text)) return Buffer.from(text, 'hex').toString('utf16le').replace(/\0+$/, '');
  return text;
}

// QSettings on Windows keeps hosts under HKCU\Software\<org>\Moonlight\hosts\<n>.
// PowerShell gives exact values (the server certificate is a multi-line
// string, which reg query's line-based output cuts short); reg query is the
// fallback.
const PS_DUMP = `$r = 'HKCU:\\Software\\${ORG}\\Moonlight\\hosts'
if (Test-Path $r) { @(Get-Item $r) + @(Get-ChildItem $r -Recurse) | ForEach-Object { $k = $_; $k.GetValueNames() | ForEach-Object {
  $v = $k.GetValue($_); if ($v -is [byte[]]) { $v = [Text.Encoding]::Unicode.GetString($v).TrimEnd([char]0) }
  [pscustomobject]@{ k = $k.Name; n = $_; v = [string]$v } } } | ConvertTo-Json -Compress }`;

function readRegistryHosts() {
  const out = {};
  const put = (keyName, name, value) => {
    const key = String(keyName).match(/\\hosts((?:\\[^\\]+)*)\s*$/i);
    if (key) out[(key[1].replace(/^\\/, '') ? key[1].replace(/^\\/, '') + '\\' : '') + name] = value;
  };
  try {
    const json = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_DUMP], { encoding: 'utf8', windowsHide: true, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!json) return out;
    for (const r of [].concat(JSON.parse(json))) put(r.k, r.n, r.v);
    return out;
  } catch { /* no PowerShell: fall back to reg query */ }
  let text;
  try {
    text = execFileSync('reg', ['query', `HKCU\\Software\\${ORG}\\Moonlight\\hosts`, '/s'], { encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return out; }
  let prefix = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) { prefix = /\\hosts((?:\\[^\\]+)*)\s*$/i.test(line) ? line.trim() : null; continue; }
    const val = line.match(/^\s+(\S+)\s+(REG_\w+)\s+(.*)$/);
    if (val && prefix !== null) put(prefix, val[1], regValue(val[2], val[3].trim()));
  }
  return out;
}

// Moonlight saves the host's MAC (learned on the LAN) as a 6-byte array.
function macOf(v) {
  if (!v) return '';
  const raw = String(v).replace(/^@ByteArray\(([\s\S]*)\)$/, '$1');
  if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(raw)) return raw.replace(/-/g, ':').toLowerCase();
  if (raw.length !== 6) return '';
  return [...raw].map((c) => (c.charCodeAt(0) & 255).toString(16).padStart(2, '0')).join(':');
}

// Wake-on-LAN magic packet: 6 x 0xff, then the MAC 16 times, sent to the
// broadcast address and straight at each known address (port 9).
function wakePacket(mac) {
  const m = String(mac).replace(/[:-]/g, '');
  if (!/^[0-9a-f]{12}$/i.test(m)) throw new Error('Bad MAC address');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(Buffer.from(m, 'hex'))]);
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
    const addresses = [h.manualaddress, h.localaddress, h.remoteaddress, h.ipv6address].filter((a) => a && a !== '');
    list.push({ uuid: h.uuid, name: h.hostname || h.uuid, apps, online: null, addresses, srvcert: h.srvcert || '', mac: macOf(h.mac) });
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
    this.clientCert = flat._cert && flat._cert.includes('BEGIN') ? flat._cert : null;
    this.clientKey = flat._key && flat._key.includes('BEGIN') ? flat._key : null;
    const cached = hostsFromFlat(flat);
    // Keep what a live refresh learned (online state, newer app lists).
    const prev = new Map(this.hosts.map((h) => [h.uuid, h]));
    this.hosts = cached.map((h) => {
      const p = prev.get(h.uuid);
      return p && p.online ? { ...h, apps: p.apps, online: p.online } : h;
    });
  }

  // Ask Sunshine/GameStream for its app list over HTTPS, as Moonlight does,
  // using this device's pairing certificate. Only talks to a server whose
  // certificate matches the one saved when pairing.
  httpsGet(host, pathAndQuery, binary = false) {
    if (!this.clientCert || !this.clientKey || !host.srvcert || !host.addresses.length) return Promise.resolve(null);
    const pinned = crypto.createHash('sha256').update(new crypto.X509Certificate(host.srvcert).raw).digest('hex');
    const tryAddr = (i) => new Promise((resolve) => {
      if (i >= host.addresses.length) { resolve(null); return; }
      const [hostname, port] = host.addresses[i].includes(']') ? [host.addresses[i], 47984] : host.addresses[i].split(':').length === 2 ? host.addresses[i].split(':') : [host.addresses[i], 47984];
      const req = https.request({
        hostname, port: Number(port) === 47989 ? 47984 : Number(port) || 47984, path: pathAndQuery, method: 'GET',
        cert: this.clientCert, key: this.clientKey, rejectUnauthorized: false, timeout: 6000,
        // No TLS session reuse: a resumed session has no peer certificate
        // to check against the pinned one.
        agent: new https.Agent({ maxCachedSessions: 0, keepAlive: false }),
        checkServerIdentity: () => undefined,
      }, (res) => {
        const peer = res.socket.getPeerCertificate();
        const got = peer && peer.raw ? crypto.createHash('sha256').update(peer.raw).digest('hex') : '';
        if (got !== pinned) { res.destroy(); resolve(null); return; }
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => tryAddr(i + 1).then(resolve));
      req.end();
    });
    return tryAddr(0);
  }

  async listDirect(host) {
    let xml;
    try { xml = await this.httpsGet(host, '/applist?uniqueid=0123456789ABCDEF'); } catch { return null; }
    if (!xml || !/<App>/.test(xml)) return null;
    const apps = [];
    for (const m of xml.matchAll(/<App>([\s\S]*?)<\/App>/g)) {
      const title = (m[1].match(/<AppTitle>([\s\S]*?)<\/AppTitle>/) || [])[1];
      const id = (m[1].match(/<ID>(\d+)<\/ID>/) || [])[1];
      const hidden = /<IsHidden>1<\/IsHidden>/.test(m[1]);
      if (title && id && !hidden) apps.push({ id, name: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), boxart: null });
    }
    return apps;
  }

  async boxartDirect(uuid, appId) {
    const host = this.hosts.find((h) => h.uuid === uuid);
    if (!host) return null;
    const key = uuid + '/' + appId;
    if (this.boxartBuf && this.boxartBuf.has(key)) return this.boxartBuf.get(key);
    const buf = await this.httpsGet(host, `/appasset?uniqueid=0123456789ABCDEF&appid=${appId}&AssetType=2&AssetIdx=0`, true).catch(() => null);
    if (buf && buf.length > 100) {
      this.boxartBuf = this.boxartBuf || new Map();
      this.boxartBuf.set(key, buf);
      return buf;
    }
    return null;
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
    if ((!this.bin && !this.clientCert) || !this.hosts.length) return Promise.resolve(false);
    if (this.refreshing) return this.refreshing;
    if (!force && Date.now() - this.lastRefresh < 60000) return Promise.resolve(false);
    this.lastRefresh = Date.now();
    this.refreshing = Promise.all(this.hosts.map(async (h) => {
      const apps = (await this.listDirect(h)) || (await this.listHost(h.uuid));
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
        mac: h.mac,
        apps: h.apps.map((a) => ({ ...a, boxart: !!this.boxartPath(h.uuid, a.id) || (!!this.clientCert && !!h.srvcert) })),
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

  host(uuid) {
    return this.hosts.find((h) => h.uuid === uuid) || null;
  }

  async wake(uuid, mac) {
    const host = this.host(uuid);
    const packet = wakePacket(mac || (host && host.mac));
    const dgram = require('dgram');
    const sock = dgram.createSocket('udp4');
    await new Promise((resolve) => sock.bind(() => { sock.setBroadcast(true); resolve(); }));
    const targets = ['255.255.255.255', ...os.networkInterfaces ? Object.values(os.networkInterfaces()).flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal && i.netmask)
      .map((i) => i.address.split('.').map((o, k) => (Number(o) | (~Number(i.netmask.split('.')[k]) & 255))).join('.')) : []];
    for (const a of (host ? host.addresses : [])) if (/^\d+\.\d+\.\d+\.\d+$/.test(a.split(':')[0])) targets.push(a.split(':')[0]);
    for (const t of [...new Set(targets)]) {
      for (const port of [9, 7]) await new Promise((resolve) => sock.send(packet, port, t, () => resolve()));
    }
    sock.close();
    return true;
  }

  // True when the host answers on GameStream's port (47989).
  reachable(uuid, timeout = 1500) {
    const host = this.host(uuid);
    if (!host || !host.addresses.length) return Promise.resolve(false);
    const net = require('net');
    return Promise.all(host.addresses.map((a) => new Promise((resolve) => {
      const hostname = a.replace(/^\[|\](:\d+)?$/g, '').replace(/:\d+$/, '');
      const s = net.connect({ host: hostname, port: 47989 });
      const done = (ok) => { s.destroy(); resolve(ok); };
      s.setTimeout(timeout, () => done(false));
      s.once('connect', () => done(true));
      s.once('error', () => done(false));
    }))).then((r) => r.some(Boolean));
  }

  // Pairs a new host: Moonlight shows nothing; the user types `pin` into
  // Sunshine's web UI. Resolves true when Moonlight reports success.
  pair(address, pin) {
    if (!this.bin) return Promise.reject(new Error('Moonlight is not installed'));
    if (!/^[\w.:\[\]-]{1,100}$/.test(address) || !/^\d{4}$/.test(pin)) return Promise.reject(new Error('Bad address or PIN'));
    return new Promise((resolve) => {
      const child = spawn(this.bin[0], [...this.bin[1], 'pair', address, '--pin', pin], { stdio: 'ignore', windowsHide: true });
      const t = setTimeout(() => { child.kill(); resolve(false); }, 180e3);
      child.on('error', () => { clearTimeout(t); resolve(false); });
      child.on('exit', (code) => { clearTimeout(t); resolve(code === 0); });
    });
  }

  openApp() {
    if (!this.bin) throw new Error('Moonlight is not installed');
    const child = spawn(this.bin[0], this.bin[1], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  }
}

module.exports = { Moonlight, parseListCsv, hostsFromFlat, readIniHosts, regValue, readRegistryHosts, macOf, wakePacket };
