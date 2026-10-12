'use strict';

const fs = require('fs');
const path = require('path');

// Steam names for each kind of artwork, in the order we try them.
const CACHE_NAMES = {
  header: ['header.jpg', 'library_header.jpg', 'capsule_616x353.jpg'],
  portrait: ['library_600x900.jpg', 'library_600x900_2x.jpg', 'library_capsule.jpg'],
  hero: ['library_hero.jpg', 'library_hero_blur.jpg'],
  logo: ['logo.png', 'logo_2x.png'],
};
const GRID_SUFFIX = { header: '', portrait: 'p', hero: '_hero', logo: '_logo' };
const CDN_HOSTS = [
  'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/',
  'https://cdn.cloudflare.steamstatic.com/steam/apps/',
];
const CDN_NAMES = {
  header: ['header.jpg'],
  portrait: ['library_600x900.jpg', 'library_600x900_2x.jpg'],
  hero: ['library_hero.jpg'],
  logo: ['logo.png'],
};

const KINDS = Object.keys(CACHE_NAMES);

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// Newer Steam clients keep art in librarycache/<appid>/[<hash>/]<name>;
// older ones use librarycache/<appid>_<name>.
function findInCache(cacheDir, appid, kind) {
  const dir = path.join(cacheDir, appid);
  for (const name of CACHE_NAMES[kind]) {
    const flat = path.join(cacheDir, appid + '_' + name);
    if (isFile(flat)) return flat;
    const direct = path.join(dir, name);
    if (isFile(direct)) return direct;
  }
  let subs = [];
  try { subs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return null; }
  for (const name of CACHE_NAMES[kind]) {
    for (const s of subs) {
      const p = path.join(dir, s.name, name);
      if (isFile(p)) return p;
    }
  }
  return null;
}

function findInGrid(gridDir, appid, kind) {
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    const p = path.join(gridDir, appid + GRID_SUFFIX[kind] + ext);
    if (isFile(p)) return p;
  }
  return null;
}

class ArtResolver {
  constructor(net) {
    this.net = net;
    this.root = null;
    this.accountId = null;
    this.memo = new Map();
    this.cdnMisses = new Set();
  }

  setLibrary(lib) {
    if (lib.root !== this.root || (lib.user && lib.user.accountId) !== this.accountId) this.memo.clear();
    this.root = lib.root;
    this.accountId = lib.user ? lib.user.accountId : null;
  }

  localPath(source, appid, kind) {
    if (!this.root || !KINDS.includes(kind) || !/^\d+$/.test(appid)) return null;
    const key = source + ':' + appid + ':' + kind;
    if (this.memo.has(key)) return this.memo.get(key);
    let found = null;
    if (this.accountId) found = findInGrid(path.join(this.root, 'userdata', this.accountId, 'config/grid'), appid, kind);
    if (!found && source === 'steam') found = findInCache(path.join(this.root, 'appcache/librarycache'), appid, kind);
    this.memo.set(key, found);
    return found;
  }

  // Returns a Response for greenblade://art/<source>/<appid>/<kind>.
  async respond(source, appid, kind) {
    const local = this.localPath(source, appid, kind);
    if (local) {
      const ext = path.extname(local).toLowerCase();
      const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return new Response(await fs.promises.readFile(local), {
        headers: { 'content-type': type, 'cache-control': 'max-age=3600' },
      });
    }
    if (source === 'steam' && KINDS.includes(kind) && /^\d+$/.test(appid)) {
      for (const host of CDN_HOSTS) {
        for (const name of CDN_NAMES[kind]) {
          const url = host + appid + '/' + name;
          if (this.cdnMisses.has(url)) continue;
          try {
            const res = await this.net.fetch(url);
            if (res.ok) return res;
          } catch { /* offline */ }
          this.cdnMisses.add(url);
        }
      }
    }
    return new Response('not found', { status: 404 });
  }
}

module.exports = { ArtResolver, KINDS };
