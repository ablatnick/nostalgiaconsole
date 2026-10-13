'use strict';

// Names for Steam apps that aren't installed (so there is no manifest to
// read them from), from the store's public appdetails endpoint. Cached on
// disk; looked up a few at a time so the store never rate-limits us.

const fs = require('fs');
const path = require('path');

class AppNames {
  constructor(net, dir) {
    this.net = net;
    this.file = path.join(dir, 'appnames.json');
    this.names = {};
    try { this.names = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch { /* first run */ }
    this.busy = false;
  }

  get(appid) {
    const n = this.names[appid];
    return typeof n === 'string' && n ? n : null;
  }

  // Looks up up to `max` unknown ids; resolves true if any name was added.
  async fill(appids, max = 25) {
    if (this.busy) return false;
    const todo = appids.filter((id) => /^\d+$/.test(id) && !(id in this.names)).slice(0, max);
    if (!todo.length) return false;
    this.busy = true;
    let added = false;
    try {
      for (const id of todo) {
        try {
          const res = await this.net.fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`);
          if (res.status === 429) break;
          const j = await res.json();
          const d = j && j[id];
          // Removed or region-locked apps: remember there is no name.
          this.names[id] = d && d.success && d.data && typeof d.data.name === 'string' ? d.data.name.slice(0, 120) : '';
          added = added || !!this.names[id];
        } catch { break; } // offline
        await new Promise((r) => setTimeout(r, 350));
      }
      fs.writeFileSync(this.file, JSON.stringify(this.names));
    } finally {
      this.busy = false;
    }
    return added;
  }
}

module.exports = { AppNames };
