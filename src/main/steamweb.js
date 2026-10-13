'use strict';

// Steam Web API (needs the user's own key from steamcommunity.com/dev/apikey):
// owned games, achievements (for gamerscore) and friends. Results are cached
// in <user data>/steamweb-cache.json so the dashboard works offline and the
// API is not hammered.

const fs = require('fs');
const path = require('path');

const API = 'https://api.steampowered.com';
const POINTS_PER_ACHIEVEMENT = 10;

class SteamWeb {
  constructor(net, dir) {
    this.net = net;
    this.file = path.join(dir, 'steamweb-cache.json');
    this.cache = { owned: null, achievements: {}, friends: null, schema: {} };
    try { Object.assign(this.cache, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* first run */ }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.cache));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch { /* cache is optional */ }
  }

  async get(key, method, params) {
    const q = new URLSearchParams({ key, format: 'json', ...params });
    const res = await this.net.fetch(`${API}/${method}/?${q}`);
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Steam rejected the API key'), { code: 'badkey' });
    if (!res.ok) throw new Error(`Steam API ${method}: HTTP ${res.status}`);
    return res.json();
  }

  async owned(key, steamid) {
    const r = await this.get(key, 'IPlayerService/GetOwnedGames/v1', { steamid, include_appinfo: 1, include_played_free_games: 1 });
    const games = ((r.response && r.response.games) || []).map((g) => ({
      appid: String(g.appid), name: g.name || `App ${g.appid}`, playtime: g.playtime_forever || 0, lastPlayed: g.rtime_last_played || 0,
    }));
    this.cache.owned = { at: Date.now(), games };
    this.save();
    return games;
  }

  // Unlocked/total for one game. Games without achievements (or private
  // stats) come back as null.
  async achievements(key, steamid, appid) {
    let r;
    try {
      r = await this.get(key, 'ISteamUserStats/GetPlayerAchievements/v1', { steamid, appid, l: 'english' });
    } catch (e) {
      if (e.code === 'badkey') throw e;
      this.cache.achievements[appid] = { at: Date.now(), none: true };
      return null;
    }
    const list = (r.playerstats && r.playerstats.achievements) || [];
    if (!list.length) {
      this.cache.achievements[appid] = { at: Date.now(), none: true };
      return null;
    }
    const unlocked = list.filter((a) => a.achieved).map((a) => ({ id: a.apiname, name: a.name || a.apiname, at: a.unlocktime || 0 }));
    const entry = { at: Date.now(), total: list.length, unlocked };
    this.cache.achievements[appid] = entry;
    return entry;
  }

  // Refreshes achievements for recently played games (and anything never
  // fetched), a few at a time.
  async refreshAchievements(key, steamid, appids, { maxAge = 6 * 3600e3, limit = 25 } = {}) {
    const stale = appids.filter((id) => {
      const a = this.cache.achievements[id];
      return !a || Date.now() - a.at > maxAge;
    }).slice(0, limit);
    for (const id of stale) await this.achievements(key, steamid, id);
    this.save();
    return this.summary();
  }

  summary() {
    let unlocked = 0;
    let total = 0;
    const perGame = {};
    for (const [id, a] of Object.entries(this.cache.achievements)) {
      if (!a || a.none) continue;
      unlocked += a.unlocked.length;
      total += a.total;
      perGame[id] = { unlocked: a.unlocked.length, total: a.total, score: a.unlocked.length * POINTS_PER_ACHIEVEMENT };
    }
    return { gamerscore: unlocked * POINTS_PER_ACHIEVEMENT, unlocked, total, perGame };
  }

  async friends(key, steamid) {
    const list = await this.get(key, 'ISteamUser/GetFriendList/v1', { steamid, relationship: 'friend' });
    const ids = ((list.friendslist && list.friendslist.friends) || []).map((f) => f.steamid);
    const people = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await this.get(key, 'ISteamUser/GetPlayerSummaries/v2', { steamids: ids.slice(i, i + 100).join(',') });
      for (const p of (r.response && r.response.players) || []) {
        people.push({
          steamid: p.steamid, name: p.personaname, avatar: p.avatarfull || p.avatarmedium || '',
          state: p.personastate || 0, game: p.gameextrainfo || '', gameId: p.gameid || '',
        });
      }
    }
    // Online first, then people in games, then by name.
    people.sort((a, b) => (Number(b.state > 0) - Number(a.state > 0)) || (Number(!!b.game) - Number(!!a.game)) || a.name.localeCompare(b.name));
    this.cache.friends = { at: Date.now(), people };
    this.save();
    return people;
  }

  // Newly unlocked achievements in `appid` since the last check.
  async newUnlocks(key, steamid, appid) {
    const prev = this.cache.achievements[appid];
    if (!prev || prev.none) {
      // First look at this game: record what is already unlocked instead of
      // announcing all of it.
      await this.achievements(key, steamid, appid);
      this.save();
      return [];
    }
    const before = new Set((prev.unlocked || []).map((a) => a.id));
    const after = await this.achievements(key, steamid, appid);
    this.save();
    if (!after) return [];
    return after.unlocked.filter((a) => !before.has(a.id));
  }
}

module.exports = { SteamWeb, POINTS_PER_ACHIEVEMENT };
