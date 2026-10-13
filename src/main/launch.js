'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Only these Steam URLs can be opened, so the UI can never ask the main
// process to open an arbitrary URL.
const ACTIONS = {
  run: (id) => 'steam://rungameid/' + id,
  details: (id) => 'steam://nav/games/details/' + id,
  store: (id) => 'steam://store/' + id,
  install: (id) => 'steam://install/' + id,
  message: (id) => 'steam://friends/message/' + id,
  profile: (id) => 'steam://url/SteamIDPage/' + id,
  storefront: () => 'steam://store',
  friends: () => 'steam://open/friends',
  downloads: () => 'steam://open/downloads',
  bigpicture: () => 'steam://open/bigpicture',
  closebigpicture: () => 'steam://close/bigpicture',
  settings: () => 'steam://open/settings',
  library: () => 'steam://open/games',
};

function onPath(bin) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, bin);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ }
  }
  return null;
}

// On Linux, hand the URL to the Steam binary that owns the library we read;
// xdg-open is not always set up for steam:// (Game Mode, minimal desktops).
function linuxCommand(root, url) {
  if (root && root.includes('com.valvesoftware.Steam') && onPath('flatpak')) {
    return ['flatpak', ['run', 'com.valvesoftware.Steam', url]];
  }
  if (root && root.includes('/snap/steam/') && fs.existsSync('/snap/bin/steam')) {
    return ['/snap/bin/steam', [url]];
  }
  const steam = onPath('steam');
  if (steam) return [steam, [url]];
  return null;
}

function steamUrl(action, id) {
  const make = ACTIONS[action];
  if (!make) throw new Error('Unknown Steam action ' + action);
  if (make.length && !/^\d+$/.test(String(id))) throw new Error('Bad id for ' + action);
  return make(String(id));
}

async function openSteam(shell, root, action, id) {
  const url = steamUrl(action, id);
  if (process.platform === 'linux') {
    const cmd = linuxCommand(root, url);
    if (cmd) {
      const child = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
      child.on('error', () => shell.openExternal(url).catch(() => {}));
      child.unref();
      return url;
    }
  }
  await shell.openExternal(url);
  return url;
}

module.exports = { openSteam, steamUrl, ACTIONS };
