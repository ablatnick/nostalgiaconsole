'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseListCsv, hostsFromFlat, readIniHosts } = require('../src/main/moonlight');

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
    '1\\apps\\size=3', '1\\hostname=DESKTOP-KOGE14A', '1\\uuid=FAD9ECDC-3B9B-CB0A-4A9D-67F80BAB9A65',
    '2\\hostname=broken-no-uuid', 'size=2', '[gcmapping]', '1\\uuid=nope',
  ].join('\n'));
  const hosts = hostsFromFlat(readIniHosts(f));
  assert.strictEqual(hosts.length, 1);
  assert.strictEqual(hosts[0].name, 'DESKTOP-KOGE14A');
  assert.deepStrictEqual(hosts[0].apps.map((a) => a.name), ['Desktop', 'Steam Big Picture']);
});
