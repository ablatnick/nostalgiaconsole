'use strict';

// Achievements and friends without a Steam Web API key, from files the
// Steam client keeps locally:
//   appcache/stats/UserGameStatsSchema_<appid>.bin   achievement list
//   appcache/stats/UserGameStats_<account>_<appid>.bin   what you unlocked
//   userdata/<account>/config/localconfig.vdf   "friends": names and avatars
// Online status comes from friends' public community profiles.

const fs = require('fs');
const path = require('path');
const vdf = require('./vdf');

const POINTS = 10;
const STEAMID64_BASE = 76561197960265728n;

function mtime(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

class LocalStats {
  constructor(net) {
    this.net = net;
    this.schemas = new Map(); // appid -> { at, list }
    this.status = new Map(); // steamid64 -> { at, state, game }
  }

  statsDir(root) {
    return path.join(root, 'appcache', 'stats');
  }

  // [{ key: 'stat:bit', api, name, desc }] or null when Steam has no schema.
  schema(root, appid) {
    const file = path.join(this.statsDir(root), `UserGameStatsSchema_${appid}.bin`);
    const at = mtime(file);
    if (!at) return null;
    const hit = this.schemas.get(appid);
    if (hit && hit.at === at) return hit.list;
    let list = [];
    try {
      const data = vdf.parseBinary(fs.readFileSync(file));
      const game = data[appid] || Object.values(data)[0] || {};
      for (const [sid, st] of Object.entries(game.stats || {})) {
        for (const [bid, b] of Object.entries((st && st.bits) || {})) {
          const d = b.display || {};
          const text = (o) => (o && (o.english || Object.values(o).find((v) => typeof v === 'string'))) || '';
          const hash = (v) => (typeof v === 'string' && /^[0-9a-f]{40}\.jpg$/.test(v) ? v.slice(0, 40) : '');
          list.push({ key: `${sid}:${b.bit ?? bid}`, api: b.name || '', name: text(d.name) || b.name || 'achievement', desc: text(d.desc), icon: hash(d.icon), iconGray: hash(d.icon_gray), hidden: String(d.hidden) === '1' });
        }
      }
    } catch { list = []; }
    this.schemas.set(appid, { at, list });
    return list;
  }

  // Map of 'stat:bit' -> unlock time.
  unlocked(root, account, appid) {
    const file = path.join(this.statsDir(root), `UserGameStats_${account}_${appid}.bin`);
    const out = new Map();
    let data;
    try { data = vdf.parseBinary(fs.readFileSync(file)); } catch { return out; }
    for (const [sid, st] of Object.entries((data && data.cache) || {})) {
      if (!st || typeof st !== 'object' || typeof st.data !== 'number') continue;
      const bits = st.data >>> 0;
      for (let bit = 0; bit < 32; bit++) {
        if (bits & (1 << bit)) out.set(`${sid}:${bit}`, Number((st.achievementtimes || {})[bit] || 0));
      }
    }
    return out;
  }

  statsFileTime(root, account, appid) {
    return mtime(path.join(this.statsDir(root), `UserGameStats_${account}_${appid}.bin`));
  }

  game(root, account, appid) {
    const list = this.schema(root, appid);
    if (!list || !list.length) return null;
    const got = this.unlocked(root, account, appid);
    const unlocked = list.filter((a) => got.has(a.key)).map((a) => ({ ...a, at: got.get(a.key) }));
    return { total: list.length, unlocked };
  }

  // Every achievement of a game, unlocked ones first (newest first), for the
  // achievements screen. Hidden locked ones keep their secret.
  details(root, account, appid) {
    const list = this.schema(root, appid);
    if (!list || !list.length) return null;
    const got = this.unlocked(root, account, appid);
    return list.map((a) => {
      const at = got.has(a.key) ? got.get(a.key) : null;
      const secret = at === null && a.hidden;
      return { name: secret ? 'hidden achievement' : a.name, desc: secret ? 'keep playing to find out' : a.desc, icon: at === null ? a.iconGray || a.icon : a.icon, unlocked: at !== null, at: at || 0 };
    }).sort((a, b) => (Number(b.unlocked) - Number(a.unlocked)) || (b.at - a.at));
  }

  // Same shape as SteamWeb.summary().
  summary(root, account, appids) {
    let unlocked = 0;
    let total = 0;
    const perGame = {};
    if (!root || !account) return { gamerscore: 0, unlocked, total, perGame };
    for (const id of appids) {
      const g = this.game(root, account, id);
      if (!g) continue;
      unlocked += g.unlocked.length;
      total += g.total;
      perGame[id] = { unlocked: g.unlocked.length, total: g.total, score: g.unlocked.length * POINTS };
    }
    return { gamerscore: unlocked * POINTS, unlocked, total, perGame };
  }

  // Friends cached by the Steam client (names and avatar hashes).
  friends(root, account) {
    let data;
    try { data = vdf.parseText(fs.readFileSync(path.join(root, 'userdata', account, 'config', 'localconfig.vdf'), 'utf8')); } catch { return []; }
    const store = (data && data.userlocalconfigstore) || {};
    const list = store.friends || {};
    const out = [];
    for (const [id, f] of Object.entries(list)) {
      if (!/^\d+$/.test(id) || id === String(account) || !f || typeof f !== 'object' || !f.name) continue;
      const steamid = (BigInt(id) + STEAMID64_BASE).toString();
      const avatar = /^[0-9a-f]{40}$/.test(f.avatar || '') ? `https://avatars.steamstatic.com/${f.avatar}_full.jpg` : '';
      const st = this.status.get(steamid) || {};
      out.push({ steamid, name: f.name, avatar, state: st.state || 0, game: st.game || '', gameId: '' });
    }
    out.sort((a, b) => (Number(b.state > 0) - Number(a.state > 0)) || (Number(!!b.game) - Number(!!a.game)) || a.name.localeCompare(b.name));
    return out;
  }

  // Online status from public profiles (friends with private profiles
  // simply stay offline). A few at a time, at most every few minutes each.
  async refreshStatus(friends, { maxAge = 4 * 60e3, limit = 40 } = {}) {
    const todo = friends.filter((f) => !this.status.has(f.steamid) || Date.now() - this.status.get(f.steamid).at > maxAge).slice(0, limit);
    const one = async (f) => {
      try {
        const res = await this.net.fetch(`https://steamcommunity.com/profiles/${f.steamid}?xml=1`);
        if (!res.ok) throw new Error(String(res.status));
        const xml = await res.text();
        const state = (xml.match(/<onlineState>([^<]+)<\/onlineState>/) || [])[1] || 'offline';
        const game = (xml.match(/<inGameInfo>[\s\S]*?<gameName><!\[CDATA\[([^\]]*)\]\]><\/gameName>/) || [])[1] || '';
        this.status.set(f.steamid, { at: Date.now(), state: state === 'offline' ? 0 : 1, game: state === 'in-game' ? game : '' });
      } catch {
        this.status.set(f.steamid, { at: Date.now(), state: 0, game: '' });
      }
    };
    for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(one));
  }
}

module.exports = { LocalStats, POINTS };
