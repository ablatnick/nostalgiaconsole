'use strict';

// RetroArch, Steam collections, our own play time, Wake-on-LAN and the
// parental PIN, against a fixture built in a temp folder.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-extras-'));
execFileSync(process.execPath, [path.join(__dirname, 'make-fixture.js')], { env: { ...process.env, FIXTURE_DIR: dir } });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('retroarch: playlists, box art, runtime logs; launch only by id', () => {
  process.env.RETROARCH_DIR = path.join(dir, 'RetroArch');
  const { RetroArch, thumbName } = require('../src/main/retroarch');
  const r = new RetroArch();
  const list = r.load([]);
  delete process.env.RETROARCH_DIR;
  assert.strictEqual(list.length, 4);
  const plumber = list.find((g) => g.name === 'Super Plumber World');
  assert.strictEqual(plumber.kind, 'retro');
  assert.strictEqual(plumber.playtime, 750); // 12:30:00
  assert.ok(plumber.lastPlayed > 0);
  // The UI never sees file paths.
  assert.ok(list.every((g) => !('rom' in g) && !('corePath' in g)));
  assert.ok(fs.existsSync(r.artFile(plumber.appid, 'boxart')));
  assert.strictEqual(r.artFile('0000000000000000', 'boxart'), null);
  assert.throws(() => r.launch('nope'));
  assert.strictEqual(thumbName('Kart: Racer? <Turbo>'), 'Kart_ Racer_ _Turbo_.png');
});

test('steam collections: by hand ones, favorites first, hidden list, filters skipped', () => {
  const { readCollections } = require('../src/main/steam');
  const c = readCollections(path.join(dir, 'Steam'), { accountId: '376923952' });
  assert.deepStrictEqual(c.collections.map((x) => x.name), ['Favorites', 'Soulslikes']);
  assert.deepStrictEqual(c.hidden, ['105600']);
  assert.deepStrictEqual(readCollections(path.join(dir, 'nowhere'), { accountId: '1' }), { collections: [], hidden: [] });
});

test('play log: only sessions spent away for over a minute count', () => {
  const { PlayLog } = require('../src/main/playlog');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-play-'));
  try {
    const log = new PlayLog(d);
    log.start('shortcut:1');
    assert.strictEqual(log.back(), 0); // never left the dashboard
    log.start('shortcut:1');
    log.away();
    log.session.at -= 30 * 60e3;
    assert.strictEqual(log.back(), 30);
    assert.strictEqual(new PlayLog(d).merge({ id: 'shortcut:1', playtime: 0, lastPlayed: 0 }).playtime, 30);
    log.start('shortcut:2');
    log.away();
    log.session.at -= 20e3;
    assert.strictEqual(log.back(), 0);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('wake-on-lan packet and moonlight mac parsing', () => {
  const { wakePacket, macOf } = require('../src/main/moonlight');
  const p = wakePacket('78:20:51:3c:ff:d2');
  assert.strictEqual(p.length, 102);
  assert.ok(p.subarray(0, 6).every((b) => b === 0xff));
  assert.strictEqual(p.subarray(96).toString('hex'), '7820513cffd2');
  assert.throws(() => wakePacket('nope'));
  assert.strictEqual(macOf('@ByteArray(\x78\x20\x51\x3c\xff\xd2)'), '78:20:51:3c:ff:d2');
  assert.strictEqual(macOf('@ByteArray()'), '');
});

test('parental pin: digits only, never in status', () => {
  const { Secrets } = require('../src/main/secrets');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-pin-'));
  try {
    const s = new Secrets(d);
    s.set({ parentPin: 'abcd' });
    assert.strictEqual(s.get('parentPin'), '');
    s.set({ parentPin: '2468' });
    assert.strictEqual(s.get('parentPin'), '2468');
    assert.strictEqual(s.status().pin, true);
    assert.ok(!JSON.stringify(s.status()).includes('2468'));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('settings: hidden games, kid profiles, wake macs', () => {
  const { sanitize } = require('../src/main/settings');
  const s = sanitize({ hidden: ['steam:1', 'retro:0123456789abcdef', 'bad'], kid: true, allowed: ['steam:2'], wakeMacs: { 'FAD9ECDC-3B9B-CB0A-4A9D-67F80BAB9A65': '78-20-51-3C-FF-D2', x: 'nope' }, musicVolume: 300 });
  assert.deepStrictEqual(s.hidden, ['steam:1', 'retro:0123456789abcdef']);
  assert.strictEqual(s.kid, true);
  assert.deepStrictEqual(s.allowed, ['steam:2']);
  assert.deepStrictEqual(s.wakeMacs, { 'FAD9ECDC-3B9B-CB0A-4A9D-67F80BAB9A65': '78:20:51:3c:ff:d2' });
  assert.strictEqual(s.musicVolume, 100);
});
