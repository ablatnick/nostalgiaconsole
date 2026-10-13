'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const vdf = require('../src/main/vdf');
const steam = require('../src/main/steam');
const { steamUrl } = require('../src/main/launch');
const { sanitize } = require('../src/main/settings');

execFileSync(process.execPath, [path.join(__dirname, 'make-fixture.js')]);
const ROOT = path.join(__dirname, 'fixture', 'Steam');

test('text VDF: nesting, escapes, comments, lowercased keys', () => {
  const out = vdf.parseText('// c\n"A"\n{\n\t"Name"\t"say \\"hi\\" C:\\\\x"\n\t"Sub" { "k" "v" } [$WIN32]\n}\n');
  assert.deepStrictEqual(out, { a: { name: 'say "hi" C:\\x', sub: { k: 'v' } } });
});

test('text VDF rejects truncated input', () => {
  assert.throws(() => vdf.parseText('"a" { "b" "c"'));
});

test('binary VDF: strings, ints, nested maps', () => {
  const buf = Buffer.concat([
    Buffer.from([0x00]), Buffer.from('root\0'),
    Buffer.from([0x01]), Buffer.from('Name\0hi\0'),
    Buffer.from([0x02]), Buffer.from('n\0'), Buffer.from([0xff, 0xff, 0xff, 0xff]),
    Buffer.from([0x08, 0x08]),
  ]);
  assert.deepStrictEqual(vdf.parseBinary(buf), { root: { name: 'hi', n: -1 } });
});

test('loads both library folders, user, playtime and shortcuts', () => {
  const lib = steam.loadLibrary(ROOT);
  assert.strictEqual(lib.user.name, 'Player One');
  assert.strictEqual(lib.user.accountId, '376923952');
  assert.strictEqual(lib.games.length, 16);
  assert.strictEqual(lib.tools.length, 3);
  const cp = lib.games.find((g) => g.appid === '1091500');
  assert.ok(cp.installed && cp.needsUpdate);
  assert.ok(cp.installDir.includes('Library2'));
  const elden = lib.games.find((g) => g.appid === '1245620');
  assert.strictEqual(elden.playtime, 6120);
  assert.deepStrictEqual(lib.shortcuts.map((s) => s.name).sort(), ['Dolphin Emulator', 'RetroArch']);
});

test('shortcut game ids match Steam (unsigned appid << 32 | 0x02000000)', () => {
  assert.strictEqual(steam.shortcutGameId(-1), '18446744069448138752');
  assert.strictEqual(steam.shortcutGameId(2000000001), '8589934596328521728');
});

test('missing Steam folder gives an empty library', () => {
  const lib = steam.loadLibrary(path.join(__dirname, 'does-not-exist'));
  assert.strictEqual(lib.root, null);
  assert.deepStrictEqual(lib.games, []);
});

test('steam URLs are whitelisted and ids validated', () => {
  assert.strictEqual(steamUrl('run', '620'), 'steam://rungameid/620');
  assert.strictEqual(steamUrl('bigpicture'), 'steam://open/bigpicture');
  assert.throws(() => steamUrl('run', '620; rm -rf /'));
  assert.throws(() => steamUrl('evil', '1'));
});

test('settings are sanitized', () => {
  const s = sanitize({ theme: 'nope', volume: 400, pinned: ['steam:1', 'steam:1', 'file:///x', 7], afterLaunch: 'close' });
  assert.strictEqual(s.theme, 'classic');
  assert.strictEqual(s.volume, 100);
  assert.deepStrictEqual(s.pinned, ['steam:1']);
  assert.strictEqual(s.afterLaunch, 'close');
});
