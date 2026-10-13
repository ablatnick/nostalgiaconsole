'use strict';

// API keys the user types in (Steam Web API, Jellyfin). Kept in their own
// file, readable only by the user, and never sent to the renderer.

const fs = require('fs');
const path = require('path');

class Secrets {
  constructor(dir) {
    this.file = path.join(dir, 'secrets.json');
    this.values = {};
    try { this.values = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch { /* none yet */ }
  }

  get(name) {
    return typeof this.values[name] === 'string' ? this.values[name] : '';
  }

  set(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (!['steamApiKey', 'jellyfinUrl', 'jellyfinKey', 'parentPin'].includes(k)) continue;
      if (typeof v !== 'string' || v.length > 300) continue;
      if (k === 'parentPin' && v && !/^\d{4,8}$/.test(v)) continue;
      if (v) this.values[k] = v.trim(); else delete this.values[k];
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2), { mode: 0o600 });
    try { fs.chmodSync(this.file, 0o600); } catch { /* not supported on this filesystem */ }
  }

  // What the renderer may know: whether each thing is set, never the value.
  status() {
    return { steam: !!this.get('steamApiKey'), jellyfin: !!(this.get('jellyfinUrl') && this.get('jellyfinKey')), jellyfinUrl: this.get('jellyfinUrl'), pin: !!this.get('parentPin') };
  }
}

module.exports = { Secrets };
