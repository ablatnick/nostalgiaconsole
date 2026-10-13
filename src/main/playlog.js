'use strict';

// Play time for games Steam doesn't time: non-Steam shortcuts (and retro
// games when RetroArch's own runtime log is off). A session runs from the
// launch while our window is in the background, and ends when the window
// comes back to the front.

const fs = require('fs');
const path = require('path');

const MIN_SESSION = 60e3; // shorter than a minute: probably didn't start
const MAX_SESSION = 12 * 3600e3; // left running overnight: don't count it all

class PlayLog {
  constructor(dir) {
    this.file = path.join(dir, 'playlog.json');
    this.log = {};
    try { this.log = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch { /* first run */ }
    this.session = null;
  }

  start(id) {
    this.session = { id, at: Date.now(), away: false };
  }

  // Window lost focus: the game is in front.
  away() {
    if (this.session) this.session.away = true;
  }

  // Window is back; returns the finished session's minutes, if it counted.
  back() {
    const s = this.session;
    if (!s || !s.away) return 0;
    this.session = null;
    const ms = Math.min(MAX_SESSION, Date.now() - s.at);
    if (ms < MIN_SESSION) return 0;
    const e = this.log[s.id] || { minutes: 0, lastPlayed: 0 };
    e.minutes += Math.round(ms / 60e3);
    e.lastPlayed = Math.floor(Date.now() / 1000);
    this.log[s.id] = e;
    try { fs.writeFileSync(this.file, JSON.stringify(this.log)); } catch { /* read-only */ }
    return Math.round(ms / 60e3);
  }

  // Adds our play time to games Steam/RetroArch didn't time.
  merge(g) {
    const e = this.log[g.id];
    if (!e) return g;
    return { ...g, playtime: Math.max(g.playtime || 0, e.minutes), lastPlayed: Math.max(g.lastPlayed || 0, e.lastPlayed) };
  }
}

module.exports = { PlayLog };
