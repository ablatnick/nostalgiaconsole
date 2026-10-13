'use strict';

// Builds test/fixture/Steam: a fake Steam install with two library folders,
// a logged-in user, play stats and non-Steam shortcuts. Real appids are used
// so artwork comes from Steam's CDN.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'fixture', 'Steam');
const LIB2 = path.join(__dirname, 'fixture', 'Library2');
const ACCOUNT = '376923952';
const ID64 = (BigInt(ACCOUNT) + 76561197960265728n).toString();
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

const GAMES = [
  // appid, name, days since played (null = never), minutes played, GB, library
  ['22380', 'Fallout: New Vegas', 1, 852, 7.3, ROOT],
  ['1245620', 'ELDEN RING', 0.2, 6120, 49, ROOT],
  ['1091500', 'Cyberpunk 2077', 3, 3300, 65, LIB2],
  ['413150', 'Stardew Valley', 6, 9400, 0.5, ROOT],
  ['1145360', 'Hades', 12, 1800, 15, ROOT],
  ['367520', 'Hollow Knight', 20, 2400, 9, LIB2],
  ['620', 'Portal 2', 45, 900, 12, ROOT],
  ['1174180', 'Red Dead Redemption 2', 70, 4100, 120, LIB2],
  ['271590', 'Grand Theft Auto V Legacy', 200, 3000, 95, LIB2],
  ['292030', 'The Witcher 3: Wild Hunt', 400, 7000, 50, ROOT],
  ['105600', 'Terraria', null, 0, 0.5, ROOT],
  ['1086940', "Baldur's Gate 3", null, 0, 140, LIB2],
  ['814380', 'Sekiro: Shadows Die Twice', 30, 2000, 25, ROOT],
  ['588650', 'Dead Cells', 8, 600, 1, ROOT],
  ['250900', 'The Binding of Isaac: Rebirth', 90, 5000, 1.5, ROOT],
  ['1794680', 'Vampire Survivors', 2, 1500, 0.6, ROOT],
];
const TOOLS = [
  ['1493710', 'Proton Experimental', ROOT],
  ['1628350', 'Steam Linux Runtime 3.0 (sniper)', ROOT],
  ['228980', 'Steamworks Common Redistributables', ROOT],
];

function kv(obj, indent = '') {
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object') out += `${indent}"${k}"\n${indent}{\n${kv(v, indent + '\t')}${indent}}\n`;
    else out += `${indent}"${k}"\t\t"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\n`;
  }
  return out;
}

function binKv(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object') {
      parts.push(Buffer.from([0x00]), Buffer.from(k + '\0'), binKv(v), Buffer.from([0x08]));
    } else if (typeof v === 'number') {
      const b = Buffer.alloc(4);
      b.writeInt32LE(v);
      parts.push(Buffer.from([0x02]), Buffer.from(k + '\0'), b);
    } else {
      parts.push(Buffer.from([0x01]), Buffer.from(k + '\0'), Buffer.from(v + '\0'));
    }
  }
  return Buffer.concat(parts);
}

function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

fs.rmSync(path.join(__dirname, 'fixture'), { recursive: true, force: true });

write(path.join(ROOT, 'steamapps/libraryfolders.vdf'), kv({
  libraryfolders: {
    0: { path: ROOT, label: '', apps: {} },
    1: { path: LIB2, label: 'Games SSD', apps: {} },
  },
}));

const apps = {};
for (const [appid, name, days, minutes, gb, lib] of GAMES) {
  const lastPlayed = days === null ? 0 : Math.floor(NOW - days * DAY);
  write(path.join(lib, 'steamapps', `appmanifest_${appid}.acf`), kv({
    AppState: {
      appid, Universe: 1, name, StateFlags: appid === '1091500' ? 6 : 4,
      installdir: name.replace(/[^\w ]/g, ''), LastUpdated: NOW - 30 * DAY,
      LastPlayed: lastPlayed, SizeOnDisk: Math.round(gb * 1024 ** 3),
    },
  }));
  apps[appid] = { LastPlayed: lastPlayed, Playtime: minutes };
}
for (const [appid, name, lib] of TOOLS) {
  write(path.join(lib, 'steamapps', `appmanifest_${appid}.acf`), kv({
    AppState: { appid, name, StateFlags: 4, installdir: name, LastPlayed: 0, SizeOnDisk: 900000000 },
  }));
}

write(path.join(ROOT, 'config/loginusers.vdf'), kv({
  users: { [ID64]: { AccountName: 'fixture', PersonaName: 'Player One', MostRecent: 1, Timestamp: NOW } },
}));

write(path.join(ROOT, 'userdata', ACCOUNT, 'config/localconfig.vdf'), kv({
  UserLocalConfigStore: { Software: { Valve: { Steam: { apps } } } },
}));

write(path.join(ROOT, 'userdata', ACCOUNT, 'config/shortcuts.vdf'), Buffer.concat([binKv({
  shortcuts: {
    0: { appid: -1294967296 + 123, AppName: 'RetroArch', Exe: '"/usr/bin/retroarch"', StartDir: '"/usr/bin/"', LastPlayTime: NOW - 4 * DAY, IsHidden: 0 },
    1: { appid: 2000000001, AppName: 'Dolphin Emulator', Exe: '"/usr/bin/dolphin-emu"', LastPlayTime: 0, IsHidden: 0 },
    2: { appid: 2000000002, AppName: 'Hidden Thing', Exe: '"/bin/true"', IsHidden: 1 },
  },
}), Buffer.from([0x08])]));

console.log('fixture written to', path.dirname(ROOT));
