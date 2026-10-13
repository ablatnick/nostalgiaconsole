'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SteamWeb } = require('../src/main/steamweb');
const { Secrets } = require('../src/main/secrets');
const { Jellyfin } = require('../src/main/jellyfin');
const { readIniHosts } = require('../src/main/moonlight');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nc-'));

// A fake net.fetch answering Steam API calls from a table.
function fakeNet(routes) {
  return {
    fetch: async (url) => {
      const u = new URL(url);
      const body = routes[u.pathname.replace(/^\/|\/$/g, '')];
      if (typeof body === 'function') return body(u);
      if (!body) return new Response('nope', { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    },
  };
}

test('gamerscore is 10G per unlocked achievement', async () => {
  const web = new SteamWeb(fakeNet({
    'ISteamUserStats/GetPlayerAchievements/v1': (u) => new Response(JSON.stringify({
      playerstats: { achievements: u.searchParams.get('appid') === '1' ? [{ apiname: 'a', achieved: 1 }, { apiname: 'b', achieved: 0 }] : [{ apiname: 'c', achieved: 1 }] },
    })),
  }), tmp());
  const sum = await web.refreshAchievements('k', 's', ['1', '2']);
  assert.strictEqual(sum.gamerscore, 20);
  assert.deepStrictEqual(sum.perGame['1'], { unlocked: 1, total: 2, score: 10 });
});

test('the first achievement check only records a baseline', async () => {
  let unlocked = [{ apiname: 'a', achieved: 1 }, { apiname: 'b', achieved: 0 }];
  const web = new SteamWeb(fakeNet({
    'ISteamUserStats/GetPlayerAchievements/v1': () => new Response(JSON.stringify({ playerstats: { achievements: unlocked } })),
  }), tmp());
  assert.deepStrictEqual(await web.newUnlocks('k', 's', '9'), []);
  unlocked = [{ apiname: 'a', achieved: 1 }, { apiname: 'b', achieved: 1, name: 'Bee' }];
  const fresh = await web.newUnlocks('k', 's', '9');
  assert.deepStrictEqual(fresh.map((a) => a.name), ['Bee']);
});

test('a rejected key is reported as badkey', async () => {
  const web = new SteamWeb(fakeNet({ 'IPlayerService/GetOwnedGames/v1': () => new Response('', { status: 403 }) }), tmp());
  await assert.rejects(web.owned('bad', 's'), (e) => e.code === 'badkey');
});

test('secrets: only known keys are stored, and status never reveals them', () => {
  const dir = tmp();
  const s = new Secrets(dir);
  s.set({ steamApiKey: ' ABC123 ', evil: 'x', jellyfinUrl: 'http://jf:8096' });
  assert.strictEqual(s.get('steamApiKey'), 'ABC123');
  assert.strictEqual(s.get('evil'), '');
  assert.deepStrictEqual(s.status(), { steam: true, jellyfin: false, jellyfinUrl: 'http://jf:8096', pin: false });
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(path.join(dir, 'secrets.json')).mode & 0o777, 0o600);
  assert.strictEqual(new Secrets(dir).get('steamApiKey'), 'ABC123');
});

test('jellyfin: items map to tiles and the proxy only allows images and video', async () => {
  const item = Jellyfin.item({ Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesName: 'Show', SeriesId: 's1', ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: 30 * 6e8, UserData: { PlayedPercentage: 40.4, PlaybackPositionTicks: 123 }, ImageTags: { Primary: 'x' }, ParentBackdropImageTags: ['y'], ParentBackdropItemId: 's1' });
  assert.strictEqual(item.episode, 'S1E2');
  assert.strictEqual(item.runtime, 30);
  assert.strictEqual(item.progress, 40);
  assert.strictEqual(item.backdropItem, 's1');
  const seen = [];
  const secrets = { get: (k) => ({ jellyfinUrl: 'http://jf:8096/', jellyfinKey: 'K' }[k] || '') };
  const jf = new Jellyfin({ fetch: async (url, opts) => { seen.push([url, opts.headers.Authorization]); return new Response('ok'); } }, secrets);
  assert.strictEqual((await jf.proxy('/Users/abc')).status, 403);
  assert.strictEqual((await jf.proxy('/Items/abc/Images/Primary?maxHeight=600')).status, 200);
  assert.strictEqual((await jf.proxy('/Videos/abc/master.m3u8?x=1')).status, 200);
  assert.strictEqual(seen[0][0], 'http://jf:8096/Items/abc/Images/Primary?maxHeight=600');
  assert.ok(seen[0][1].includes('Token="K"'));
});

test('moonlight: client certificate and pinned server certificate are decoded', () => {
  const f = path.join(tmp(), 'Moonlight.conf');
  fs.writeFileSync(f, [
    '[General]',
    'certificate="@ByteArray(-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----\\n)"',
    'key="@ByteArray(-----BEGIN PRIVATE KEY-----\\nBBB\\n-----END PRIVATE KEY-----\\n)"',
    '[hosts]',
    '1\\srvcert="@ByteArray(-----BEGIN CERTIFICATE-----\\nCCC\\n-----END CERTIFICATE-----\\n)"',
    '1\\uuid=ABCD-1234',
  ].join('\n'));
  const flat = readIniHosts(f);
  assert.ok(flat._cert.startsWith('-----BEGIN CERTIFICATE-----\nAAA\n'));
  assert.ok(flat._key.includes('\nBBB\n'));
  assert.ok(flat['1\\srvcert'].includes('\nCCC\n'));
});

test('local stats: achievements and friends from Steam files, no key', () => {
  const { LocalStats } = require('../src/main/localstats');
  const root = tmp();
  const kv = (obj) => {
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'object') parts.push(Buffer.from([0]), Buffer.from(k + '\0'), kv(v), Buffer.from([8]));
      else if (typeof v === 'number') { const b = Buffer.alloc(4); b.writeInt32LE(v); parts.push(Buffer.from([2]), Buffer.from(k + '\0'), b); }
      else parts.push(Buffer.from([1]), Buffer.from(k + '\0'), Buffer.from(v + '\0'));
    }
    return Buffer.concat(parts);
  };
  fs.mkdirSync(path.join(root, 'appcache/stats'), { recursive: true });
  fs.writeFileSync(path.join(root, 'appcache/stats/UserGameStatsSchema_77.bin'), Buffer.concat([kv({ 77: { stats: { 1: { type: '4', bits: {
    0: { name: 'A', bit: 0, display: { name: { english: 'First' } } },
    1: { name: 'B', bit: 1, display: { name: { english: 'Second' } } },
    5: { name: 'C', bit: 5, display: { name: { english: 'Sixth' } } },
  } } } } }), Buffer.from([8])]));
  fs.writeFileSync(path.join(root, 'appcache/stats/UserGameStats_42_77.bin'), Buffer.concat([kv({ cache: { 1: { data: 0b100001, achievementtimes: { 0: 100, 5: 200 } } } }), Buffer.from([8])]));
  fs.mkdirSync(path.join(root, 'userdata/42/config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'userdata/42/config/localconfig.vdf'), '"UserLocalConfigStore"\n{\n "friends"\n {\n  "42" { "name" "me" }\n  "1000" { "name" "Pal" "avatar" "fb8821025c4500cce9371d016dfc66b50ada5ae5" }\n }\n}\n');
  const ls = new LocalStats(null);
  const g = ls.game(root, '42', '77');
  assert.deepStrictEqual(g.unlocked.map((a) => a.name), ['First', 'Sixth']);
  assert.strictEqual(g.total, 3);
  assert.strictEqual(ls.summary(root, '42', ['77']).gamerscore, 20);
  const fr = ls.friends(root, '42');
  assert.strictEqual(fr.length, 1);
  assert.strictEqual(fr[0].steamid, String(1000n + 76561197960265728n));
  assert.ok(fr[0].avatar.endsWith('fb8821025c4500cce9371d016dfc66b50ada5ae5_full.jpg'));
});
