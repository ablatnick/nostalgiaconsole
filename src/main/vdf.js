'use strict';

// Steam's KeyValues formats. Keys are lowercased because Steam is not
// consistent about case ("Apps" vs "apps", "LastPlayed" vs "lastplayed").

function parseText(src) {
  let i = 0;
  const n = src.length;

  function skip() {
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      // Platform conditionals like [$WIN32] are ignored.
      if (c === '[') {
        while (i < n && src[i] !== ']') i++;
        i++;
        continue;
      }
      break;
    }
  }

  function token() {
    skip();
    if (i >= n) return null;
    const c = src[i];
    if (c === '{' || c === '}') { i++; return { brace: c }; }
    if (c === '"') {
      i++;
      let out = '';
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) {
          const e = src[i + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else {
          out += src[i++];
        }
      }
      i++;
      return { str: out };
    }
    let out = '';
    while (i < n && !/[\s{}"]/.test(src[i])) out += src[i++];
    return { str: out };
  }

  function object(top) {
    const obj = {};
    for (;;) {
      const k = token();
      if (k === null) {
        if (top) return obj;
        throw new Error('Unexpected end of VDF');
      }
      if (k.brace === '}') {
        if (top) throw new Error('Unexpected } in VDF');
        return obj;
      }
      if (k.brace) throw new Error('Unexpected { in VDF');
      const v = token();
      if (v === null) throw new Error('Missing value for ' + k.str);
      if (v.brace === '{') obj[k.str.toLowerCase()] = object(false);
      else if (v.brace) throw new Error('Unexpected } in VDF');
      else obj[k.str.toLowerCase()] = v.str;
    }
  }

  return object(true);
}

// Binary KeyValues (shortcuts.vdf).
function parseBinary(buf) {
  let i = 0;

  function cstr() {
    const end = buf.indexOf(0, i);
    if (end < 0) throw new Error('Unterminated string in binary VDF');
    const s = buf.toString('utf8', i, end);
    i = end + 1;
    return s;
  }

  function object() {
    const obj = {};
    while (i < buf.length) {
      const type = buf[i++];
      if (type === 0x08 || type === 0x0b) return obj;
      const key = cstr().toLowerCase();
      switch (type) {
        case 0x00: obj[key] = object(); break;
        case 0x01: obj[key] = cstr(); break;
        case 0x02: obj[key] = buf.readInt32LE(i); i += 4; break;
        case 0x03: obj[key] = buf.readFloatLE(i); i += 4; break;
        case 0x07: obj[key] = buf.readBigUInt64LE(i).toString(); i += 8; break;
        case 0x0a: obj[key] = buf.readBigInt64LE(i).toString(); i += 8; break;
        default: throw new Error('Unknown binary VDF type 0x' + type.toString(16));
      }
    }
    return obj;
  }

  return object();
}

module.exports = { parseText, parseBinary };
