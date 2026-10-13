'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseListCsv, hostsFromFlat, readIniHosts, regValue } = require('../src/main/moonlight');

test('parses `moonlight list --csv` output', () => {
  const out = parseListCsv([
    'Qt Info: noise',
    'Name, ID, HDR Support, App Collection Game, Hidden, Direct Launch, Boxart URL',
    '"Desktop",881448767,true,false,false,false,"file:///tmp/c/boxart/ABCD-1234/881448767.png"',
    '"Big, ""Quoted"" Game",12,false,false,false,false,""',
    '"Secret",13,false,false,true,false,""',
  ].join('\n'));
  assert.deepStrictEqual(out, [
    { id: '881448767', name: 'Desktop', boxart: '/tmp/c/boxart/ABCD-1234/881448767.png' },
    { id: '12', name: 'Big, "Quoted" Game', boxart: null },
  ]);
  assert.strictEqual(parseListCsv('error: host offline'), null);
});

test('reads paired hosts and cached apps from Moonlight.conf', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gb-')), 'Moonlight.conf');
  fs.writeFileSync(f, [
    '[General]', 'x=1', '[hosts]',
    '1\\apps\\1\\id=881448767', '1\\apps\\1\\name=Desktop',
    '1\\apps\\2\\id=1093255277', '1\\apps\\2\\name=Steam Big Picture',
    '1\\apps\\3\\id=5', '1\\apps\\3\\name=Hidden', '1\\apps\\3\\hidden=true',
    '1\\apps\\size=3', '1\\hostname=GAMING-PC', '1\\uuid=0A1B2C3D-4E5F-6071-8293-A4B5C6D7E8F9',
    '2\\hostname=broken-no-uuid', 'size=2', '[gcmapping]', '1\\uuid=nope',
  ].join('\n'));
  const hosts = hostsFromFlat(readIniHosts(f));
  assert.strictEqual(hosts.length, 1);
  assert.strictEqual(hosts[0].name, 'GAMING-PC');
  assert.deepStrictEqual(hosts[0].apps.map((a) => a.name), ['Desktop', 'Steam Big Picture']);
});

test('decodes Windows registry values the way QSettings writes them', () => {
  // App ids are ints, so REG_DWORD, which reg query prints in hex.
  assert.strictEqual(regValue('REG_DWORD', '0x34896c3f'), '881421375');
  assert.strictEqual(regValue('REG_QWORD', '0x100000000'), '4294967296');
  assert.strictEqual(regValue('REG_SZ', 'Desktop'), 'Desktop');
  // Strings with a NUL in them are UTF-16 REG_BINARY.
  assert.strictEqual(regValue('REG_BINARY', Buffer.from('a\0b', 'utf16le').toString('hex')), 'a\0b');
  const hosts = hostsFromFlat({
    '1\\uuid': '8D1C9F9E-1234-4ABC-9DEF-0123456789AB', '1\\hostname': 'PC',
    '1\\apps\\1\\name': 'Desktop', '1\\apps\\1\\id': regValue('REG_DWORD', '0x34896c3f'),
  });
  assert.deepStrictEqual(hosts[0].apps, [{ id: '881421375', name: 'Desktop' }]);
});
