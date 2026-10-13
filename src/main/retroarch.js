'use strict';

// RetroArch: its playlists (*.lpl, JSON) become a "retro" section, with box
// art from its thumbnails folder and play time from its runtime logs. Games
// start by id only: the paths come from the playlists we read, never from
// the UI.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

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

// Config folders, each with how to start that RetroArch.
function candidates(steamLibraries = []) {
  const home = os.homedir();
  const steamDirs = steamLibraries.map((l) => path.join(l, 'steamapps', 'common', 'RetroArch'));
  const exe = process.platform === 'win32' ? 'retroarch.exe' : 'retroarch';
  const list = [];
  if (process.env.RETROARCH_DIR) list.push({ dir: process.env.RETROARCH_DIR, cmd: [path.join(process.env.RETROARCH_DIR, exe)] });
  if (process.platform === 'win32') {
    for (const d of [path.join(process.env.APPDATA || '', 'RetroArch'), 'C:\\RetroArch-Win64', 'C:\\RetroArch', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'RetroArch')]) {
      list.push({ dir: d, cmd: [path.join(d, exe)] });
    }
  } else {
    list.push(
      { dir: path.join(home, '.var/app/org.libretro.RetroArch/config/retroarch'), cmd: ['flatpak', 'run', 'org.libretro.RetroArch'] },
      { dir: path.join(home, 'snap/retroarch/current/.config/retroarch'), cmd: ['/snap/bin/retroarch'] },
      { dir: path.join(home, '.config/retroarch'), cmd: [onPath('retroarch') || 'retroarch'] },
    );
  }
  for (const d of steamDirs) list.push({ dir: d, cmd: [path.join(d, exe)] });
  return list.filter((c) => exists(c.dir));
}

// retroarch.cfg lines are key = "value"; ":" at the start means the
// config folder.
function readCfg(dir) {
  const cfg = {};
  try {
    for (const line of fs.readFileSync(path.join(dir, 'retroarch.cfg'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(\w+)\s*=\s*"(.*)"\s*$/);
      if (m) cfg[m[1]] = m[2];
    }
  } catch { /* defaults */ }
  const resolve = (v, fallback) => {
    if (!v || v === 'default') return path.join(dir, fallback);
    if (v.startsWith(':')) return path.join(dir, v.slice(1).replace(/^[\\/]+/, ''));
    return v.replace(/^~(?=[\\/])/, os.homedir());
  };
  return {
    playlists: resolve(cfg.playlist_directory, 'playlists'),
    thumbnails: resolve(cfg.thumbnails_directory, 'thumbnails'),
    logs: resolve(cfg.runtime_log_directory, path.join('playlists', 'logs')),
  };
}

// RetroArch's thumbnail names: these characters become underscores.
function thumbName(label) {
  return String(label).replace(/[&*/:`<>?\\|"]/g, '_') + '.png';
}

// Runtime log (content_runtime_log): runtime "h:mm:ss", last_played date.
// The log folder is named after the core ("Snes9x"), which the playlist's
// core name ("Nintendo - SNES / SFC (Snes9x - Current)") contains.
function runtimeLog(logs, coreName, rom, dirs) {
  if (!coreName) return null;
  const base = path.basename(rom).replace(/\.[^.]+$/, '');
  const dir = dirs.find((d) => d === coreName.replace(/[\\/]/g, '_') || coreName.includes(d));
  if (!dir) return null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(logs, dir, base + '.lrtl'), 'utf8'));
    const [h, m] = String(j.runtime || '0:0:0').split(':').map(Number);
    const t = Date.parse(String(j.last_played || '').replace(' ', 'T'));
    return { playtime: (h || 0) * 60 + (m || 0), lastPlayed: Number.isFinite(t) ? Math.floor(t / 1000) : 0 };
  } catch { return null; }
}

class RetroArch {
  constructor() {
    this.games = new Map();
    this.install = null;
  }

  load(steamLibraries) {
    this.games = new Map();
    this.install = null;
    for (const c of candidates(steamLibraries)) {
      const cfg = readCfg(c.dir);
      let files = [];
      try { files = fs.readdirSync(cfg.playlists).filter((f) => f.endsWith('.lpl')); } catch { continue; }
      if (!files.length) continue;
      this.install = { ...c, ...cfg };
      let logDirs = [];
      try { logDirs = fs.readdirSync(cfg.logs).sort((a, b) => b.length - a.length); } catch { /* logging off */ }
      for (const f of files) {
        let pl;
        try { pl = JSON.parse(fs.readFileSync(path.join(cfg.playlists, f), 'utf8')); } catch { continue; } // old 6-line format
        const system = f.replace(/\.lpl$/, '');
        for (const it of (pl && Array.isArray(pl.items) ? pl.items : [])) {
          if (!it || !it.path) continue;
          const core = it.core_path && it.core_path !== 'DETECT' ? it.core_path : pl.default_core_path && pl.default_core_path !== 'DETECT' ? pl.default_core_path : '';
          const label = it.label || path.basename(it.path).replace(/\.[^.]+$/, '');
          const id = crypto.createHash('sha1').update(it.path).digest('hex').slice(0, 16);
          const coreName = it.core_name && it.core_name !== 'DETECT' ? it.core_name : pl.default_core_name || '';
          const log = runtimeLog(cfg.logs, coreName, it.path, logDirs) || { playtime: 0, lastPlayed: 0 };
          this.games.set(id, {
            id: 'retro:' + id, kind: 'retro', appid: id, gameId: id, name: label, system,
            core: coreName, installed: true, size: 0, ...log,
            rom: it.path, corePath: core,
            boxart: path.join(cfg.thumbnails, system, 'Named_Boxarts', thumbName(label)),
            snap: path.join(cfg.thumbnails, system, 'Named_Snaps', thumbName(label)),
            title: path.join(cfg.thumbnails, system, 'Named_Titles', thumbName(label)),
          });
        }
      }
      break; // the first RetroArch with playlists wins
    }
    return this.list();
  }

  // What the UI gets: no file paths.
  list() {
    return [...this.games.values()].map(({ rom, corePath, boxart, snap, title, ...g }) => g);
  }

  artFile(id, kind) {
    const g = this.games.get(id);
    if (!g) return null;
    const file = { boxart: g.boxart, portrait: g.boxart, header: g.title, hero: g.snap }[kind];
    return file && exists(file) ? file : null;
  }

  launch(id) {
    const g = this.games.get(id);
    if (!g || !this.install) throw new Error('Unknown retro game');
    const [cmd, ...pre] = this.install.cmd;
    const args = g.corePath ? [...pre, '-L', g.corePath, g.rom] : pre;
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', cwd: path.dirname(cmd) === '.' ? undefined : path.dirname(cmd) });
    child.on('error', () => {});
    child.unref();
    return g.name;
  }
}

module.exports = { RetroArch, thumbName, readCfg };
