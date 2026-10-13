'use strict';

// Jellyfin: the server URL and an API key (Dashboard > API Keys) come from
// the user. The renderer never sees the key: images and video go through
// nostalgia://jf/..., and this module adds the key on the way out.

const CLIENT = 'MediaBrowser Client="NostalgiaConsole", Device="NostalgiaConsole", DeviceId="nostalgiaconsole", Version="1.1.0"';

class Jellyfin {
  constructor(net, secrets) {
    this.net = net;
    this.secrets = secrets;
    this.userId = null;
  }

  base() {
    return this.secrets.get('jellyfinUrl').replace(/\/+$/, '');
  }

  configured() {
    return !!(this.base() && this.secrets.get('jellyfinKey'));
  }

  headers(extra = {}) {
    return { 'X-Emby-Authorization': `${CLIENT}, Token="${this.secrets.get('jellyfinKey')}"`, ...extra };
  }

  async api(pathAndQuery, opts = {}) {
    if (!this.configured()) throw new Error('Jellyfin is not set up');
    const res = await this.net.fetch(this.base() + pathAndQuery, { ...opts, headers: this.headers(opts.headers) });
    if (res.status === 401) throw Object.assign(new Error('Jellyfin rejected the API key'), { code: 'badkey' });
    if (!res.ok) throw new Error(`Jellyfin ${pathAndQuery.split('?')[0]}: HTTP ${res.status}`);
    return res.status === 204 ? null : res.json();
  }

  // An API key is not tied to a user, so pick one: the preferred name, else
  // the first administrator, else the first user.
  async user(preferred) {
    const users = await this.api('/Users');
    const u = users.find((x) => preferred && x.Name.toLowerCase() === preferred.toLowerCase())
      || users.find((x) => x.Policy && x.Policy.IsAdministrator) || users[0];
    if (!u) throw new Error('No Jellyfin users');
    this.userId = u.Id;
    return { id: u.Id, name: u.Name, all: users.map((x) => x.Name) };
  }

  static item(i) {
    return {
      id: i.Id, name: i.Name, type: i.Type,
      series: i.SeriesName || '', episode: i.Type === 'Episode' ? `S${i.ParentIndexNumber || 0}E${i.IndexNumber || 0}` : '',
      year: i.ProductionYear || '', runtime: i.RunTimeTicks ? Math.round(i.RunTimeTicks / 6e8) : 0,
      progress: i.UserData && i.UserData.PlayedPercentage ? Math.round(i.UserData.PlayedPercentage) : 0,
      position: i.UserData ? i.UserData.PlaybackPositionTicks || 0 : 0,
      overview: (i.Overview || '').slice(0, 400),
      image: i.ImageTags && i.ImageTags.Primary ? 'Primary' : '',
      backdrop: (i.BackdropImageTags && i.BackdropImageTags.length) || (i.ParentBackdropImageTags && i.ParentBackdropImageTags.length) ? 'Backdrop' : '',
      backdropItem: i.BackdropImageTags && i.BackdropImageTags.length ? i.Id : i.ParentBackdropItemId || i.SeriesId || i.Id,
      thumbItem: i.Type === 'Episode' ? i.SeriesId || i.Id : i.Id,
    };
  }

  async shelves(preferred) {
    const u = this.userId ? { id: this.userId } : await this.user(preferred);
    const fields = 'Fields=Overview,PrimaryImageAspectRatio&EnableImageTypes=Primary,Backdrop,Thumb';
    const [resume, nextUp, movies, shows] = await Promise.all([
      this.api(`/Users/${u.id}/Items/Resume?Limit=12&MediaTypes=Video&${fields}`),
      this.api(`/Shows/NextUp?UserId=${u.id}&Limit=12&${fields}`),
      this.api(`/Users/${u.id}/Items/Latest?IncludeItemTypes=Movie&Limit=16&${fields}`),
      this.api(`/Users/${u.id}/Items/Latest?IncludeItemTypes=Series&Limit=16&${fields}`),
    ]);
    const map = (list) => (Array.isArray(list) ? list : (list && list.Items) || []).map(Jellyfin.item);
    return { resume: map(resume), nextUp: map(nextUp), movies: map(movies), shows: map(shows) };
  }

  async episodes(seriesId) {
    const r = await this.api(`/Shows/${seriesId}/Episodes?UserId=${this.userId}&Fields=Overview&Limit=200`);
    return (r.Items || []).map(Jellyfin.item);
  }

  // Proxy a request from the renderer (images, HLS playlists and segments).
  async proxy(pathAndQuery) {
    if (!this.configured()) return new Response('not set up', { status: 404 });
    if (!/^\/(Items\/[\w-]+\/Images\/\w+|Videos\/[\w-]+\/)/.test(pathAndQuery)) return new Response('forbidden', { status: 403 });
    return this.net.fetch(this.base() + pathAndQuery, { headers: this.headers() });
  }

  async report(kind, body) {
    const path = { start: '/Sessions/Playing', progress: '/Sessions/Playing/Progress', stop: '/Sessions/Playing/Stopped' }[kind];
    if (!path) return;
    await this.api(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }).catch(() => {});
  }

  webUrl(itemId) {
    return `${this.base()}/web/#/details?id=${encodeURIComponent(itemId)}`;
  }
}

module.exports = { Jellyfin };
