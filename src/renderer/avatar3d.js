// 3D avatars in the style of the 2008 console avatars: smooth, rounded
// bodies with a slightly large head, built from simple shapes and lit like
// a studio turntable. Looks come from avatar.js (PARTS / normalizeLook).

import * as THREE from './vendor/three.module.min.js';
import { normalizeLook } from './avatar.js';

const BUILD = { slim: 0.86, regular: 1, broad: 1.18 };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...opts });
}

function mesh(geo, material, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], name) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (name) m.name = name;
  return m;
}

const SPHERE = new THREE.SphereGeometry(1, 40, 28);
const SPHERE_LO = new THREE.SphereGeometry(1, 20, 14);
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 8, 24);
// Upper part of a sphere (hair, hats): phi 0..PI*k from the top.
const shell = (k, seg = 40) => new THREE.SphereGeometry(1, seg, 24, 0, Math.PI * 2, 0, Math.PI * k);

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return c;
}

function textTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Torso material: a plain color, or a pattern painted onto the capsule.
function topMaterial(l) {
  if (l.top === 'sweater') {
    return mat(0xffffff, {
      map: textTexture((g, w, h) => {
        g.fillStyle = l.topColor; g.fillRect(0, 0, w, h);
        g.fillStyle = '#' + shade(l.topColor, 0.16).getHexString();
        for (const y of [0.38, 0.5, 0.62]) g.fillRect(0, y * h, w, h * 0.05);
      }),
    });
  }
  if (l.top === 'jersey') {
    return mat(0xffffff, {
      map: textTexture((g, w, h) => {
        g.fillStyle = l.topColor; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.font = 'bold 58px Arial Black, Arial, sans-serif'; g.textAlign = 'center';
        g.fillText('08', w * 0.75, h * 0.56);
      }),
    });
  }
  if (l.top === 'flannel') {
    return mat(0xffffff, {
      roughness: 0.85,
      map: textTexture((g, w, h) => {
        g.fillStyle = l.topColor; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(0,0,0,.28)';
        for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 12, h);
        for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 12);
        g.fillStyle = 'rgba(255,255,255,.18)';
        for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 3, h);
      }),
    });
  }
  if (l.top === 'suit') return mat(0x2b2f36, { roughness: 0.5 });
  return mat(l.topColor, { roughness: l.top === 'jacket' ? 0.45 : 0.7 });
}

// The head is an ellipsoid; features sit on its surface.
const HEAD = [0.235, 0.26, 0.235];
function onFace(x, y, lift = 0) {
  const k = 1 - (x / HEAD[0]) ** 2 - (y / HEAD[1]) ** 2;
  return HEAD[2] * Math.sqrt(Math.max(0, k)) + lift;
}

// Part of a unit sphere: keeps the triangles whose centre passes keep(x, y, z).
const shellCache = new Map();
function shellGeometry(keep) {
  const key = keep.toString() + (keep.key || '');
  if (keep.key && shellCache.has(key)) return shellCache.get(key);
  const src = new THREE.SphereGeometry(1, 96, 72).toNonIndexed();
  const pos = src.attributes.position.array;
  const nor = src.attributes.normal.array;
  const p = [];
  const n = [];
  for (let i = 0; i < pos.length; i += 9) {
    const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3;
    const cy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3;
    const cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
    if (!keep(cx, cy, cz)) continue;
    for (let k = 0; k < 9; k += 3) {
      let x = pos[i + k];
      let y = pos[i + k + 1];
      let z = pos[i + k + 2];
      // Pull vertices that fall below a hairline up onto it, so the edge
      // is a smooth curve instead of a staircase of triangles.
      if (keep.line) {
        const ly = keep.line(x, z);
        if (y < ly) {
          const r0 = Math.hypot(x, z) || 1;
          const r1 = Math.sqrt(Math.max(0, 1 - ly * ly));
          x = (x / r0) * r1;
          z = (z / r0) * r1;
          y = ly;
        }
      }
      p.push(x, y, z);
      n.push(x, y, z);
    }
  }
  src.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  if (keep.key) shellCache.set(key, g);
  return g;
}

// keep() for hair: y on the unit sphere above a line that goes from
// `front` (forehead) through `side` (over the ears) to `back`.
function hairline(front, side, back) {
  const line = (x, z) => {
    const az = Math.abs(Math.atan2(x, z)) / Math.PI;
    const t = az < 0.5 ? az * 2 : (az - 0.5) * 2;
    const ease = t * t * (3 - 2 * t);
    return az < 0.5 ? front + (side - front) * ease : side + (back - side) * ease;
  };
  // Keep a band a little below the line too; those vertices get snapped up.
  const f = (x, y, z) => y > line(x, z) - 0.06;
  f.line = line;
  f.key = [front, side, back].join(',');
  return f;
}

// A hood that hugs the head and opens in an oval around the face.
function snugHood(head, material) {
  const keep = (x, y, z) => y > -0.62 && !(z > 0.25 && (x / 0.66) ** 2 + ((y + 0.06) / 0.74) ** 2 < 1);
  const hood = mesh(shellGeometry(keep), material, [0, 0, -0.008], [HEAD[0] * 1.12, HEAD[1] * 1.1, HEAD[2] * 1.12]);
  hood.material.side = THREE.DoubleSide;
  head.add(hood);
  // A soft rim around the face opening.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 10, 48), material);
  rim.position.set(0, -0.012, 0.17);
  rim.scale.set(0.165, 0.2, 0.1);
  head.add(rim);
}

// A sci-fi helmet with a wide tinted visor (power armor costumes and the
// helmet hat).
function spaceHelmet(head, shellM, visorColor = 0xe0a020) {
  head.add(mesh(SPHERE, shellM, [0, 0.025, -0.005], [0.29, 0.31, 0.3]));
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.26),
    mat(visorColor, { roughness: 0.08, metalness: 0.6, emissive: visorColor, emissiveIntensity: 0.15 }));
  visor.position.set(0, 0.035, 0.012);
  visor.scale.set(0.296, 0.316, 0.306);
  visor.rotation.y = Math.PI / 2;
  head.add(visor);
  head.add(mesh(new THREE.BoxGeometry(1, 1, 1), shellM, [0, -0.13, 0.24], [0.11, 0.07, 0.06]));
  for (const s of [-1, 1]) head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x2b2f33, { roughness: 0.5 }), [s * 0.285, 0.02, 0], [0.03, 0.1, 0.12]));
}

function buildHead(l) {
  const head = new THREE.Group();
  head.name = 'head';
  const skin = mat(l.skin, { roughness: 0.55 });
  const hairM = mat(l.hairColor, { roughness: 0.75 });
  const dark = mat(0x1a1a1a, { roughness: 0.3 });

  // Skull + jaw, ears, nose.
  head.add(mesh(SPHERE, skin, [0, 0, 0], HEAD));
  for (const s of [-1, 1]) head.add(mesh(SPHERE_LO, skin, [s * 0.232, 0, -0.01], [0.04, 0.06, 0.03]));
  head.add(mesh(SPHERE_LO, mat(shade(l.skin, -0.04), { roughness: 0.55 }), [0, -0.03, onFace(0, -0.03) - 0.012], [0.032, 0.042, 0.035]));

  // Eyes: white, iris, pupil, highlight. Each eye has a lid for blinking.
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  const white = mat(0xffffff, { roughness: 0.25 });
  const iris = mat(l.eyeColor, { roughness: 0.3 });
  const shine = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 });
  const eyeShape = { round: [1, 1], wide: [1.12, 1.18], happy: [1, 0.35], sleepy: [1, 0.62], narrow: [1.08, 0.6] }[l.eyes] || [1, 1];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.085, 0.035, onFace(0.085, 0.035) - 0.024);
    e.add(mesh(SPHERE, white, [0, 0, 0], [0.056 * eyeShape[0], 0.064 * eyeShape[1], 0.03]));
    if (l.eyes !== 'happy') {
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.056 * eyeShape[0], 0.006, 6, 24, Math.PI * 0.8), dark);
      lash.position.set(0, 0.002, 0.012);
      lash.rotation.z = Math.PI * 0.1;
      lash.scale.y = 1.12 * eyeShape[1];
      e.add(lash);
    }
    if (l.eyes !== 'happy') {
      e.add(mesh(SPHERE_LO, iris, [s * 0.004, -0.004, 0.024], [0.034, 0.038 * Math.min(1, eyeShape[1] + 0.2), 0.012]));
      e.add(mesh(SPHERE_LO, dark, [s * 0.004, -0.004, 0.033], [0.017, 0.019, 0.006]));
      e.add(mesh(SPHERE_LO, shine, [s * 0.004 + 0.013, 0.013, 0.037], [0.008, 0.008, 0.003]));
    } else {
      // Closed, smiling eyes: a dark arc.
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 24, Math.PI), dark);
      arc.position.set(0, -0.01, 0.03);
      e.add(arc);
    }
    if (l.eyes === 'sleepy') e.add(mesh(SPHERE, skin, [0, 0.03, 0.006], [0.054, 0.034, 0.03]));
    const lid = mesh(SPHERE, skin, [0, 0.0, 0.004], [0.054, 0.062 * eyeShape[1], 0.032], 'lid');
    lid.visible = false;
    e.add(lid);
    eyes.add(e);
  }
  head.add(eyes);

  // Eyebrows.
  if (l.brows !== 'none') {
    const browM = mat(l.hairColor === '#f2f2f2' ? 0xbdbdbd : l.hairColor);
    for (const s of [-1, 1]) {
      const b = mesh(cap(0.012, 0.06), browM, [s * 0.085, 0.098, onFace(0.085, 0.098) + 0.004]);
      b.rotation.z = Math.PI / 2 + s * ({ arched: 0.12, flat: 0, raised: 0.3, angry: -0.32 }[l.brows] || 0);
      if (l.brows === 'raised') b.position.y += 0.015;
      head.add(b);
    }
  }

  // Mouth.
  const lip = mat(0x7a2b22, { roughness: 0.4 });
  if (l.facialHair !== 'beard') {
    if (l.mouth === 'grin') {
      const g = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lip);
      g.position.set(0, -0.1, onFace(0, -0.1) - 0.018);
      g.scale.set(0.07, 0.045, 0.03);
      head.add(g);
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), white, [0, -0.106, onFace(0, -0.106) + 0.004], [0.1, 0.012, 0.01]));
    } else if (l.mouth === 'open') {
      head.add(mesh(SPHERE_LO, lip, [0, -0.11, onFace(0, -0.11) - 0.008], [0.032, 0.04, 0.02]));
    } else if (l.mouth === 'flat') {
      const m = mesh(cap(0.009, 0.07), lip, [0, -0.105, onFace(0, -0.105) + 0.003]);
      m.rotation.z = Math.PI / 2;
      head.add(m);
    } else {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 8, 24, Math.PI * (l.mouth === 'smirk' ? 0.55 : 0.85)), lip);
      arc.position.set(0, -0.07, onFace(0, -0.11) + 0.004);
      arc.rotation.z = Math.PI + Math.PI * (l.mouth === 'smirk' ? 0.12 : 0.075);
      head.add(arc);
    }
  }

  // Facial hair: a shell over the jaw with the mouth left open.
  const fh = l.facialHair;
  if (fh === 'beard' || fh === 'stubble' || fh === 'goatee') {
    const m = fh === 'stubble' ? mat(l.hairColor, { transparent: true, opacity: 0.3, roughness: 0.9 }) : mat(l.hairColor, { roughness: 0.85 });
    const keep = fh === 'goatee'
      ? (x, y, z) => z > 0.35 && Math.abs(x) < 0.32 && y < -0.42
      : (x, y, z) => z > -0.3 && (y < -0.3 || (Math.abs(x) > 0.82 && y < 0.15)) && !(z > 0.55 && (x / 0.34) ** 2 + ((y + 0.43) / 0.13) ** 2 < 1);
    const sc = fh === 'stubble' ? 1.012 : 1.05;
    head.add(mesh(shellGeometry(keep), m, [0, 0, 0], [HEAD[0] * sc, HEAD[1] * sc, HEAD[2] * sc]));
  }
  if (fh === 'mustache' || fh === 'goatee' || fh === 'beard') {
    const hm = mat(l.hairColor, { roughness: 0.85 });
    for (const s of [-1, 1]) {
      const lobe = mesh(SPHERE_LO, hm, [s * 0.03, -0.075, onFace(0.03, -0.075) - 0.004], [0.036, 0.016, 0.014]);
      lobe.rotation.z = s * -0.25;
      head.add(lobe);
    }
  }

  // Face markings.
  if (l.marks === 'freckles') {
    const fm = mat(shade(l.skin, -0.18), { roughness: 0.7 });
    for (const s of [-1, 1]) for (const [dx, dy] of [[0.06, -0.02], [0.09, -0.04], [0.11, -0.015], [0.075, -0.055], [0.12, -0.05]]) {
      head.add(mesh(SPHERE_LO, fm, [s * dx, dy, onFace(dx, dy) - 0.002], [0.006, 0.006, 0.004]));
    }
  } else if (l.marks === 'rosy') {
    for (const s of [-1, 1]) head.add(mesh(SPHERE_LO, mat(0xf08a8a, { transparent: true, opacity: 0.55, roughness: 0.8 }), [s * 0.12, -0.05, onFace(0.12, -0.05) - 0.004], [0.04, 0.025, 0.01]));
  } else if (l.marks === 'scar') {
    const sc = mesh(cap(0.004, 0.08), mat(shade(l.skin, -0.25), { roughness: 0.8 }), [0.085, 0.05, onFace(0.085, 0.05) + 0.012]);
    sc.rotation.z = 0.35;
    head.add(sc);
  } else if (l.marks === 'paint') {
    for (const s of [-1, 1]) for (const dy of [-0.04, -0.07]) {
      const st = mesh(cap(0.008, 0.06), mat(0xc4282d, { roughness: 0.5 }), [s * 0.13, dy, onFace(0.13, dy) - 0.002]);
      st.rotation.z = Math.PI / 2 + s * 0.15;
      head.add(st);
    }
  }

  // Hair: a shell cut along a hairline (high at the forehead, down past
  // the temples to the ears, lower at the back), shaped per style.
  // Under a cap, beanie or helmet only flat hair (and long hair below it)
  // shows: no fringe, spikes, curls or crest poking through.
  const covered = ['cap', 'flatcap', 'beanie', 'propeller', 'bandana', 'santa', 'hardhat', 'helmet'].includes(l.hat);
  const hs = covered && ['short', 'sidepart', 'spiky', 'pompadour', 'curly', 'afro', 'mohawk', 'bun'].includes(l.hairStyle) ? 'buzz' : l.hairStyle;
  const H = (front, side, back) => hairline(front, side, back);
  const hairShell = (keep, sc = 1.07, puff = 1) => mesh(shellGeometry(keep), hairM, [0, 0.005 * puff, -0.004], [HEAD[0] * sc, HEAD[1] * sc * puff, HEAD[2] * sc]);
  if (hs === 'short') {
    head.add(hairShell(H(0.5, 0.18, -0.35), 1.075, 1.03));
    // A side-swept fringe.
    const fringe = mesh(SPHERE, hairM, [-0.04, 0.17, onFace(-0.04, 0.17) - 0.03], [0.15, 0.05, 0.06]);
    fringe.rotation.z = 0.25;
    head.add(fringe);
  } else if (hs === 'buzz') {
    head.add(mesh(shellGeometry(H(0.52, 0.2, -0.38)), mat(shade(l.hairColor, 0.04), { roughness: 0.95 }), [0, 0, 0], [HEAD[0] * 1.018, HEAD[1] * 1.018, HEAD[2] * 1.018]));
  } else if (hs === 'spiky') {
    head.add(hairShell(H(0.5, 0.2, -0.3), 1.06));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const ring = i % 2 ? 0.45 : 0.8;
      const dir = new THREE.Vector3(Math.sin(a) * ring, 1, Math.cos(a) * ring - 0.15).normalize();
      const c = mesh(new THREE.ConeGeometry(0.05, 0.16, 10), hairM, [dir.x * 0.24, 0.17 + dir.y * 0.08, dir.z * 0.23]);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      head.add(c);
    }
  } else if (hs === 'long' || hs === 'bob') {
    const long = hs === 'long';
    head.add(hairShell(H(0.42, long ? -0.95 : -0.62, -1), long ? 1.09 : 1.12, 1.04));
    // Hair falling down the back and over the shoulders.
    if (long) head.add(mesh(cap(0.2, 0.3), hairM, [0, -0.3, -0.1], [1.2, 1, 0.65]));
    // Fringe across the forehead.
    if (!covered) head.add(mesh(SPHERE, hairM, [0, 0.16, onFace(0, 0.16) - 0.035], [0.2, 0.065, 0.07]));
  } else if (hs === 'curly') {
    head.add(hairShell(H(0.48, 0.1, -0.4), 1.06));
    for (let i = 0; i < 40; i++) {
      // Curls spread over the hair surface (golden-angle spiral).
      const t = i / 40;
      const y = 1 - t * 1.25;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (z > 0.55 && y < 0.55) continue;
      head.add(mesh(SPHERE_LO, hairM, [x * HEAD[0] * 1.12, y * HEAD[1] * 1.08, z * HEAD[2] * 1.1], [0.055, 0.055, 0.055]));
    }
  } else if (hs === 'mohawk') {
    head.add(mesh(shellGeometry(H(0.5, 0.2, -0.38)), mat(shade(l.hairColor, 0.12), { roughness: 0.95, transparent: true, opacity: 0.5 }), [0, 0, 0], [HEAD[0] * 1.012, HEAD[1] * 1.012, HEAD[2] * 1.012]));
    // Crest along the midline, from the forehead hairline over to the nape.
    const crest = mesh(new THREE.TorusGeometry(0.262, 0.04, 12, 48, Math.PI * 0.8), hairM, [0, 0.01, -0.01]);
    crest.rotation.set(0, Math.PI / 2, -0.12);
    crest.scale.set(1, 1.08, 1);
    head.add(crest);
  } else if (hs === 'sidepart') {
    head.add(hairShell(H(0.48, 0.16, -0.36), 1.07, 1.03));
    const sweep = mesh(SPHERE, hairM, [0.03, 0.2, onFace(0.03, 0.2) - 0.045], [0.19, 0.06, 0.08]);
    sweep.rotation.z = -0.3;
    head.add(sweep);
  } else if (hs === 'pompadour') {
    head.add(hairShell(H(0.5, 0.2, -0.36), 1.06));
    const quiff = mesh(SPHERE, hairM, [0, 0.215, 0.09], [0.16, 0.085, 0.14]);
    quiff.rotation.x = -0.35;
    head.add(quiff);
  } else if (hs === 'afro') {
    // A big round shell with a hairline, so the face stays clear.
    head.add(mesh(shellGeometry(H(0.5, -0.15, -0.6)), hairM, [0, 0.07, -0.04], [0.33, 0.32, 0.32]));
    // Curls over the whole shell give it the round, textured volume.
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const y = 1 - t * 1.6;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (z > 0.35 && y < 0.5) continue;
      head.add(mesh(SPHERE_LO, hairM, [x * 0.33, 0.07 + y * 0.32, z * 0.32 - 0.04], [0.075, 0.075, 0.075]));
    }
  } else if (hs === 'bun') {
    head.add(hairShell(H(0.5, 0.1, -0.2), 1.05));
    head.add(mesh(SPHERE, hairM, [0, 0.27, -0.12], [0.085, 0.085, 0.085]));
  } else if (hs === 'pigtails') {
    head.add(hairShell(H(0.46, 0.12, -0.3), 1.06));
    for (const s of [-1, 1]) {
      head.add(mesh(SPHERE_LO, mat(0xe35fa8), [s * 0.235, 0.05, -0.05], [0.03, 0.03, 0.03]));
      const tail = mesh(cap(0.05, 0.2), hairM, [s * 0.28, -0.06, -0.06]);
      tail.rotation.z = s * 0.35;
      head.add(tail);
    }
  } else if (hs === 'braids') {
    head.add(hairShell(H(0.48, -0.3, -0.6), 1.06));
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.05 + i * 0.15);
      const braid = mesh(cap(0.022, 0.32), hairM, [Math.cos(a) * 0.22, -0.2, Math.sin(a) * 0.2 - 0.03]);
      braid.rotation.x = 0.12;
      head.add(braid);
    }
  } else if (hs === 'ponytail') {
    head.add(hairShell(H(0.5, 0.15, -0.3), 1.06));
    head.add(mesh(SPHERE_LO, mat(0x2b2f33), [0, 0.06, -0.265], [0.035, 0.035, 0.035]));
    const tail = mesh(cap(0.05, 0.24), hairM, [0, -0.1, -0.3]);
    tail.rotation.x = 0.3;
    head.add(tail);
  }

  // Glasses.
  const frame = mat(0x2b2b2b, { roughness: 0.35 });
  if (l.glasses === 'round' || l.glasses === 'square') {
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 8, l.glasses === 'round' ? 32 : 4), frame);
      r.position.set(s * 0.085, 0.035, onFace(0.085, 0.035) + 0.012);
      if (l.glasses === 'square') r.rotation.z = Math.PI / 4;
      head.add(r);
    }
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.BoxGeometry(1, 1, 1), frame, [s * 0.2, 0.045, 0.08], [0.008, 0.008, 0.22]);
      arm.rotation.y = s * 0.28;
      head.add(arm);
    }
    const bridge = mesh(cap(0.006, 0.04), frame, [0, 0.04, onFace(0, 0.04) + 0.01]);
    bridge.rotation.z = Math.PI / 2;
    head.add(bridge);
  } else if (l.glasses === 'shades') {
    const lens = mat(0x111111, { roughness: 0.1, metalness: 0.4 });
    for (const s of [-1, 1]) head.add(mesh(SPHERE, lens, [s * 0.085, 0.03, onFace(0.085, 0.03) + 0.004], [0.07, 0.05, 0.025]));
    const bar = mesh(cap(0.008, 0.18), lens, [0, 0.07, onFace(0, 0.07) + 0.012]);
    bar.rotation.z = Math.PI / 2;
    head.add(bar);
  } else if (l.glasses === 'aviators') {
    const gold = mat(0xd4af37, { roughness: 0.25, metalness: 0.5 });
    const lens = mat(0x3b2a1a, { roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85 });
    for (const s of [-1, 1]) {
      head.add(mesh(SPHERE, lens, [s * 0.085, 0.022, onFace(0.085, 0.022) + 0.006], [0.06, 0.055, 0.02]));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.004, 6, 32), gold);
      rim.position.set(s * 0.085, 0.022, onFace(0.085, 0.022) + 0.012);
      rim.scale.y = 0.95;
      head.add(rim);
      const arm = mesh(new THREE.BoxGeometry(1, 1, 1), gold, [s * 0.2, 0.045, 0.08], [0.005, 0.005, 0.22]);
      arm.rotation.y = s * 0.28;
      head.add(arm);
    }
    const bar = mesh(cap(0.004, 0.05), gold, [0, 0.07, onFace(0, 0.07) + 0.012]);
    bar.rotation.z = Math.PI / 2;
    head.add(bar);
  } else if (l.glasses === 'monocle') {
    const gold = mat(0xd4af37, { roughness: 0.25, metalness: 0.5 });
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.006, 8, 32), gold);
    r.position.set(0.085, 0.035, onFace(0.085, 0.035) + 0.012);
    head.add(r);
    head.add(mesh(SPHERE, mat(0xffffff, { transparent: true, opacity: 0.2, roughness: 0.05 }), [0.085, 0.035, onFace(0.085, 0.035) + 0.01], [0.055, 0.055, 0.008]));
    const chain = mesh(cap(0.003, 0.16), gold, [0.13, -0.06, 0.18]);
    chain.rotation.z = 0.25;
    head.add(chain);
  } else if (l.glasses === '3d') {
    const frame3d = mat(0xf2f2f2, { roughness: 0.5 });
    head.add(mesh(new THREE.BoxGeometry(1, 1, 1), frame3d, [0, 0.035, onFace(0, 0.035) + 0.012], [0.26, 0.075, 0.012]));
    head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xe0262c, { transparent: true, opacity: 0.85, roughness: 0.1 }), [-0.07, 0.035, onFace(0, 0.035) + 0.02], [0.085, 0.05, 0.004]));
    head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x1c9fe0, { transparent: true, opacity: 0.85, roughness: 0.1 }), [0.07, 0.035, onFace(0, 0.035) + 0.02], [0.085, 0.05, 0.004]));
  } else if (l.glasses === 'goggles') {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.016, 8, 48), mat(0x2b2f33, { roughness: 0.8 }));
    strap.position.y = 0.04;
    strap.rotation.x = Math.PI / 2;
    head.add(strap);
    for (const s of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 24), mat(0x5a4a3a, { roughness: 0.4, metalness: 0.3 }), [s * 0.085, 0.04, onFace(0.085, 0.04) + 0.012]);
      cup.rotation.x = Math.PI / 2;
      head.add(cup);
      head.add(mesh(SPHERE, mat(0x8fd6ff, { roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.75 }), [s * 0.085, 0.04, onFace(0.085, 0.04) + 0.033], [0.045, 0.045, 0.01]));
    }
  } else if (l.glasses === 'visor') {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 32, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
      mat(0x29c7e8, { transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide }));
    v.position.set(0, 0.035, 0.0);
    head.add(v);
  }

  // Hats, sized from the head's width where they sit.
  const hatM = mat(l.hatColor, { roughness: 0.7 });
  const ringR = (y) => HEAD[0] * Math.sqrt(Math.max(0, 1 - (y / HEAD[1]) ** 2));
  if (l.hat === 'cap') {
    head.add(mesh(shellGeometry((x, y) => y > 0.42), hatM, [0, 0, 0], [HEAD[0] * 1.09, HEAD[1] * 1.12, HEAD[2] * 1.09]));
    const brim = mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, false, -Math.PI / 2, Math.PI), mat(shade(l.hatColor, 0.1), { roughness: 0.7 }), [0, 0.13, 0.12], [0.19, 0.016, 0.22]);
    brim.rotation.x = 0.22;
    head.add(brim);
    head.add(mesh(SPHERE_LO, mat(shade(l.hatColor, -0.12)), [0, HEAD[1] * 1.1, 0], [0.018, 0.012, 0.018]));
  } else if (l.hat === 'beanie') {
    head.add(mesh(shellGeometry((x, y) => y > 0.4), hatM, [0, 0.01, 0], [HEAD[0] * 1.1, HEAD[1] * 1.18, HEAD[2] * 1.1]));
    const cuff = mesh(new THREE.CylinderGeometry(ringR(0.13) + 0.025, ringR(0.16) + 0.028, 0.07, 40, 1, true), mat(shade(l.hatColor, -0.08), { roughness: 0.8, side: THREE.DoubleSide }), [0, 0.145, 0]);
    head.add(cuff);
    head.add(mesh(SPHERE_LO, mat(shade(l.hatColor, 0.12)), [0, HEAD[1] * 1.16 + 0.03, 0], [0.05, 0.05, 0.05]));
  } else if (l.hat === 'headphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.016, 10, 40, Math.PI), mat(0x2b2f33));
    head.add(band);
    for (const s of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 24), hatM, [s * 0.25, 0, 0]);
      cup.rotation.z = Math.PI / 2;
      head.add(cup);
    }
  } else if (l.hat === 'tophat') {
    const black = mat(0x1d1f22, { roughness: 0.4 });
    const y0 = 0.19;
    head.add(mesh(new THREE.CylinderGeometry(ringR(y0) + 0.02, ringR(y0) + 0.03, 0.3, 32), black, [0, y0 + 0.15, 0]));
    head.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.014, 40), black, [0, y0 + 0.005, 0]));
    head.add(mesh(new THREE.CylinderGeometry(ringR(y0) + 0.032, ringR(y0) + 0.034, 0.045, 32), hatM, [0, y0 + 0.04, 0]));
  } else if (l.hat === 'crown') {
    const gold = mat(0xf2c230, { roughness: 0.25, metalness: 0.35 });
    const y0 = 0.17;
    const r = ringR(y0) + 0.012;
    head.add(mesh(new THREE.CylinderGeometry(r, r, 0.07, 36, 1, true), mat(0xf2c230, { roughness: 0.25, metalness: 0.35, side: THREE.DoubleSide }), [0, y0, 0]));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      head.add(mesh(new THREE.ConeGeometry(0.03, 0.08, 8), gold, [Math.sin(a) * r, y0 + 0.07, Math.cos(a) * r]));
      head.add(mesh(SPHERE_LO, mat(l.hatColor, { roughness: 0.2 }), [Math.sin(a) * (r + 0.004), y0, Math.cos(a) * (r + 0.004)], [0.016, 0.016, 0.016]));
    }
  } else if (l.hat === 'flatcap') {
    head.add(mesh(shellGeometry((x, y) => y > 0.4), hatM, [0, 0.005, -0.01], [HEAD[0] * 1.1, HEAD[1] * 1.04, HEAD[2] * 1.14]));
    const brim = mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, false, -Math.PI / 2, Math.PI), hatM, [0, 0.13, 0.15], [0.17, 0.016, 0.12]);
    brim.rotation.x = 0.3;
    head.add(brim);
  } else if (l.hat === 'propeller') {
    const panels = ['#c4282d', '#f0b000', '#2c7fd0', '#5aa51e'];
    panels.forEach((col, i) => {
      const q = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI * 0.4), mat(col, { roughness: 0.6 }));
      q.scale.set(HEAD[0] * 1.1, HEAD[1] * 1.12, HEAD[2] * 1.1);
      head.add(q);
    });
    head.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), mat(0x2b2f33), [0, 0.3, 0]));
    const prop = mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xf0b000, { roughness: 0.4 }), [0, 0.335, 0], [0.24, 0.006, 0.04]);
    prop.rotation.y = 0.5;
    prop.name = 'propeller';
    head.add(prop);
  } else if (l.hat === 'beret') {
    const b = mesh(SPHERE, hatM, [0.03, 0.22, -0.02], [0.26, 0.07, 0.25]);
    b.rotation.z = -0.25;
    head.add(b);
    head.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), hatM, [0.06, 0.29, -0.02]));
  } else if (l.hat === 'bandana') {
    head.add(mesh(shellGeometry((x, y) => y > 0.3), hatM, [0, 0, 0], [HEAD[0] * 1.07, HEAD[1] * 1.07, HEAD[2] * 1.07]));
    head.add(mesh(SPHERE_LO, hatM, [0.05, 0.06, -0.25], [0.04, 0.035, 0.03]));
    for (const s of [-1, 1]) {
      const tail = mesh(cap(0.015, 0.09), hatM, [0.05 + s * 0.02, 0.0, -0.26]);
      tail.rotation.z = s * 0.4;
      head.add(tail);
    }
  } else if (l.hat === 'santa') {
    const red = mat(0xc4282d, { roughness: 0.75 });
    head.add(mesh(shellGeometry((x, y) => y > 0.42), red, [0, 0.01, 0], [HEAD[0] * 1.1, HEAD[1] * 1.12, HEAD[2] * 1.1]));
    const cone = mesh(new THREE.ConeGeometry(0.17, 0.32, 24), red, [0.05, 0.36, -0.04]);
    cone.rotation.z = -0.5;
    head.add(cone);
    const fur = mesh(new THREE.TorusGeometry(ringR(0.12) + 0.03, 0.035, 12, 40), mat(0xffffff, { roughness: 0.95 }), [0, 0.12, 0]);
    fur.rotation.x = Math.PI / 2;
    head.add(fur);
    head.add(mesh(SPHERE_LO, mat(0xffffff, { roughness: 0.95 }), [0.19, 0.44, -0.04], [0.045, 0.045, 0.045]));
  } else if (l.hat === 'hardhat') {
    const yellow = mat(0xf2c230, { roughness: 0.35 });
    head.add(mesh(shellGeometry((x, y) => y > 0.3), yellow, [0, 0.02, 0], [HEAD[0] * 1.13, HEAD[1] * 1.15, HEAD[2] * 1.13]));
    head.add(mesh(new THREE.CylinderGeometry(ringR(0.07) + 0.06, ringR(0.07) + 0.07, 0.014, 40), yellow, [0, 0.085, 0.01]));
    head.add(mesh(new THREE.BoxGeometry(1, 1, 1), yellow, [0, 0.27, 0], [0.04, 0.04, 0.42]));
  } else if (l.hat === 'helmet') {
    spaceHelmet(head, mat(l.hatColor, { roughness: 0.35, metalness: 0.3 }));
  }
  return head;
}

// ---------- costumes ----------
// Full outfits that replace the clothes (and sometimes the head). All
// original designs.
const COSTUMES = {
  robot: { suit: 0xb8c2cc, metal: true, head: 'robot', trim: 0x2a7fd6 },
  astronaut: { suit: 0xf2f2ee, head: 'astronaut', trim: 0x2a7fd6, pack: true },
  pilot: { suit: 0x2d5fa8, head: 'pilot', trim: 0xf2f2f2 },
  trooper: { suit: 0x3e4a3a, armor: 0x6f7d66, head: 'trooper', trim: 0x9aa58e },
  robe: { suit: 0x3b3f6e, robe: true, head: 'hood', trim: 0xc9a54a },
  knight: { suit: 0x8d949b, metal: true, head: 'knight', trim: 0xc4282d },
  ninja: { suit: 0x1c1d20, head: 'ninja', trim: 0xc4282d },
  wizard: { suit: 0x5b2f8c, robe: true, head: 'wizard', trim: 0xf2c230 },
  alien: { suit: 0x2b2f33, head: 'alien', trim: 0x6fdc4b },
  armor: { suit: 0x55663a, armor: 0x6d7f48, head: 'armor', trim: 0x2b2f33, bulky: true },
  hunter: { suit: 0x4c5648, armor: 0x8a8d6a, head: 'hunter', trim: 0x9a3a2a, pack: true, bulky: true },
  fox: { suit: 0xf0a020, head: 'fox', trim: 0xffffff, tail: 'fox' },
  cat: { suit: 0x8d9196, head: 'cat', trim: 0xf2c6d0, tail: 'cat' },
  bear: { suit: 0x7a5a3a, head: 'bear', trim: 0xd9b48c, tail: 'bear' },
  hero: { suit: 0x34373e, head: 'hero', trim: 0xf2c230, cape: true },
  pirate: { suit: 0x4a2c1a, head: 'pirate', trim: 0xd4af37, coat: true, under: 0xf2f2f2, pants: 0x2b2f33 },
  cowboy: { suit: 0xc9a46a, head: 'cowboy', trim: 0xc4282d, pants: 0x3a5a86, vest: 0x6a4a2e },
  chef: { suit: 0xf6f6f2, head: 'chef', trim: 0xc4282d, pants: 0x2b2f33, buttons: true },
  firefighter: { suit: 0xb8913a, head: 'fire', trim: 0xd9f25a, stripes: true },
  scientist: { suit: 0xf6f6f6, head: 'scientist', trim: 0x2b2f33, coat: true, under: 0x5b7aa8, pants: 0x3a3d44 },
  viking: { suit: 0x6a4a2e, head: 'viking', trim: 0x8d949b, fur: true },
  samurai: { suit: 0x8e1c1c, armor: 0x2b2f33, head: 'samurai', trim: 0xd4af37, plates: true },
  zombie: { suit: 0x5d5a48, head: 'zombie', trim: 0x3a2a1a, skin: '#9db07a', pants: 0x3a4250, torn: true },
  mummy: { suit: 0xe8dcc0, head: 'mummy', trim: 0xc8b890, tex: 'bandage' },
  dino: { suit: 0x5aa51e, head: 'dino', trim: 0xf0e080, tail: 'dino' },
};

function costumeOf(l) {
  const c = COSTUMES[l.costume];
  if (!c) return null;
  // "costume color" recolors the main suit (and armor plates a shade lighter).
  if (l.costumeColor && l.costumeColor !== 'default') {
    const col = new THREE.Color(l.costumeColor).getHex();
    return { ...c, suit: col, armor: c.armor ? shade(l.costumeColor, 0.12).getHex() : c.armor };
  }
  return c;
}

// A tapered limb segment: cylinder between two radii with a ball joint at
// the top.
function segment(rTop, rBottom, len, material) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(rTop, rBottom, len, 24), material, [0, -len / 2, 0]));
  g.add(mesh(SPHERE_LO, material, [0, 0, 0], [rTop, rTop, rTop]));
  return g;
}

function buildArm(l, side, suit) {
  // Pivot at the shoulder; the forearm hangs from an elbow pivot.
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'armL' : 'armR';
  const sleeve = suit ? suit.m : topMaterial(l);
  const skin = mat(l.skin, { roughness: 0.55 });
  const sleeveless = !suit && l.top === 'tank';
  const short = sleeveless || (!suit && (l.top === 'tee' || l.top === 'jersey' || l.top === 'vest'));
  const shirt = !suit && l.top === 'vest' ? mat(0xf2f2f2, { roughness: 0.7 }) : null;
  const upperM = sleeveless ? skin : shirt || sleeve;
  arm.add(mesh(SPHERE, upperM, [0, 0, 0], [0.057, 0.06, 0.058]));
  const upper = segment(0.05, 0.043, 0.25, upperM);
  if (short) upper.children[0].scale.y = 0.45;
  arm.add(upper);
  if (short) arm.add(mesh(new THREE.CylinderGeometry(0.043, 0.04, 0.14, 20), skin, [0, -0.18, 0]));
  const elbow = new THREE.Group();
  elbow.name = 'elbow';
  elbow.position.set(0, -0.25, 0);
  elbow.rotation.x = -0.12;
  const foreM = short ? skin : sleeve;
  elbow.add(segment(0.042, 0.034, 0.22, foreM));
  if (l.extras === 'watch' && side < 0) {
    elbow.add(mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 20), mat(0x2b2f33, { roughness: 0.4 }), [0, -0.19, 0]));
    const face = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 20), mat(0xd4af37, { roughness: 0.25, metalness: 0.5 }), [0, -0.19, 0.036]);
    face.rotation.x = Math.PI / 2;
    elbow.add(face);
  }
  if (suit && suit.trim) elbow.add(mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 20), mat(suit.trim), [0, -0.2, 0]));
  // Hand: palm, fingers block and a thumb (gloves for most costumes).
  const handM = suit && suit.gloves ? suit.gloves : skin;
  elbow.add(mesh(SPHERE, handM, [0, -0.27, 0.005], [0.042, 0.055, 0.03]));
  elbow.add(mesh(SPHERE, handM, [0, -0.315, 0.01], [0.036, 0.038, 0.026]));
  const thumb = mesh(cap(0.012, 0.03), handM, [-side * 0.032, -0.262, 0.022]);
  thumb.rotation.z = side * 0.6;
  elbow.add(thumb);
  arm.add(elbow);
  return arm;
}

function costumeHead(l, c, head) {
  const ringR = (y) => HEAD[0] * Math.sqrt(Math.max(0, 1 - (y / HEAD[1]) ** 2));
  const trim = mat(c.trim, { roughness: 0.35 });
  switch (c.head) {
    case 'robot': {
      const metal = mat(c.suit, { roughness: 0.25, metalness: 0.35 });
      head.add(mesh(SPHERE, metal, [0, 0.01, 0], [0.24, 0.25, 0.24]));
      const visor = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 32, 1, true, -Math.PI * 0.42, Math.PI * 0.84), mat(0x29d4ff, { emissive: 0x29d4ff, emissiveIntensity: 1.2, side: THREE.DoubleSide }), [0, 0.03, 0.012]);
      head.add(visor);
      head.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), metal, [0.1, 0.3, 0]));
      head.add(mesh(SPHERE_LO, trim, [0.1, 0.38, 0], [0.02, 0.02, 0.02]));
      for (const s of [-1, 1]) {
        const ear = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 24), trim, [s * 0.24, 0, 0]);
        ear.rotation.z = Math.PI / 2;
        head.add(ear);
      }
      return 'replace';
    }
    case 'alien': {
      const green = mat(0x8fd16a, { roughness: 0.45 });
      head.add(mesh(SPHERE, green, [0, 0.05, 0], [0.25, 0.3, 0.24]));
      head.add(mesh(SPHERE, green, [0, -0.13, 0.04], [0.13, 0.1, 0.13]));
      for (const s of [-1, 1]) {
        const eye = mesh(SPHERE, mat(0x0b0b0d, { roughness: 0.05, metalness: 0.3 }), [s * 0.1, 0.02, 0.19], [0.075, 0.045, 0.04]);
        eye.rotation.z = s * 0.45;
        head.add(eye);
      }
      return 'replace';
    }
    case 'knight': {
      const metal = mat(c.suit, { roughness: 0.25, metalness: 0.35 });
      head.add(mesh(SPHERE, metal, [0, 0.02, 0], [0.255, 0.28, 0.255]));
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x111111), [0, 0.03, 0.24], [0.2, 0.025, 0.03]));
      for (let i = 0; i < 4; i++) head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x111111), [-0.045 + i * 0.03, -0.06, 0.235], [0.012, 0.07, 0.03]));
      const plume = mesh(cap(0.04, 0.22), trim, [0, 0.3, -0.06]);
      plume.rotation.x = -0.9;
      head.add(plume);
      return 'replace';
    }
    case 'trooper': {
      const armor = mat(c.armor, { roughness: 0.4, metalness: 0.2 });
      head.add(mesh(SPHERE, armor, [0, 0.03, 0], [0.255, 0.28, 0.255]));
      head.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.09, 32, 1, true, -Math.PI * 0.4, Math.PI * 0.8), mat(0x15181a, { roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide }), [0, 0.03, 0.01]));
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(c.trim), [0, -0.1, 0.2], [0.12, 0.05, 0.08]));
      return 'replace';
    }
    case 'astronaut': {
      head.add(mesh(SPHERE, mat(0xffffff, { transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2 }), [0, 0.02, 0.01], [0.33, 0.34, 0.33]));
      const ring = mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 40), mat(c.suit), [0, -0.27, 0.01]);
      ring.rotation.x = Math.PI / 2;
      head.add(ring);
      return 'keep';
    }
    case 'pilot': {
      head.add(mesh(shell(0.55), mat(0xf2f2f2, { roughness: 0.3 }), [0, 0.02, -0.01], [0.27, 0.29, 0.275]));
      head.add(mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.1, 32, 1, true, -Math.PI * 0.36, Math.PI * 0.72), mat(0xf0b000, { transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide }), [0, 0.07, 0.01]));
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), trim, [0, 0.24, 0.12], [0.03, 0.06, 0.12]));
      return 'nohair';
    }
    case 'ninja': {
      const cloth = mat(c.suit, { roughness: 0.8 });
      head.add(mesh(shell(0.5), cloth, [0, 0.01, 0], [0.247, 0.275, 0.247]));
      head.add(mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), cloth, [0, -0.01, 0.01], [0.245, 0.27, 0.245]));
      const band = mesh(new THREE.TorusGeometry(0.248, 0.018, 8, 40), trim, [0, 0.1, 0]);
      band.rotation.x = Math.PI / 2;
      head.add(band);
      return 'nohair';
    }
    case 'hood': {
      const cloth = mat(c.suit, { roughness: 0.85 });
      snugHood(head, cloth);
      return 'nohair';
    }
    case 'wizard': {
      const cloth = mat(c.suit, { roughness: 0.75 });
      head.add(mesh(shellGeometry((x, y) => y > 0.38), cloth, [0, 0, 0], [HEAD[0] * 1.1, HEAD[1] * 1.1, HEAD[2] * 1.1]));
      head.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.016, 40), cloth, [0, 0.105, -0.01]));
      const cone = mesh(new THREE.ConeGeometry(0.2, 0.5, 32), cloth, [0, 0.36, -0.03]);
      cone.rotation.x = -0.15;
      head.add(cone);
      for (const [x, y] of [[0.06, 0.24], [-0.08, 0.34], [0.03, 0.46]]) head.add(mesh(SPHERE_LO, mat(c.trim, { emissive: c.trim, emissiveIntensity: 0.5 }), [x, y, 0.13], [0.018, 0.018, 0.01]));
      return 'nohat';
    }
    case 'pirate': {
      const black = mat(0x1d1f22, { roughness: 0.6 });
      head.add(mesh(shellGeometry((x, y) => y > 0.4), black, [0, 0.01, 0], [HEAD[0] * 1.1, HEAD[1] * 1.12, HEAD[2] * 1.1]));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const flap = mesh(SPHERE, black, [Math.sin(a) * 0.17, 0.17, Math.cos(a) * 0.17], [0.17, 0.09, 0.03]);
        flap.rotation.y = a;
        flap.rotation.x = -0.35;
        head.add(flap);
      }
      const band = mesh(new THREE.TorusGeometry(ringR(0.11) + 0.02, 0.008, 6, 40), mat(c.trim, { roughness: 0.3, metalness: 0.4 }), [0, 0.11, 0]);
      band.rotation.x = Math.PI / 2;
      head.add(band);
      head.add(mesh(SPHERE, mat(0x111111), [0.085, 0.035, onFace(0.085, 0.035) + 0.008], [0.055, 0.05, 0.015]));
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.006, 6, 48), mat(0x111111));
      strap.rotation.set(Math.PI / 2, 0.45, 0);
      strap.position.y = 0.06;
      head.add(strap);
      return 'flat';
    }
    case 'cowboy': {
      const felt = mat(0x6a4a2e, { roughness: 0.8 });
      head.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.016, 48), felt, [0, 0.16, 0], [1, 1, 0.9]));
      head.add(mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.18, 32), felt, [0, 0.25, 0]));
      head.add(mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.03, 32), mat(0x2b2f33), [0, 0.19, 0]));
      return 'flat';
    }
    case 'chef': {
      const white = mat(0xffffff, { roughness: 0.9 });
      head.add(mesh(new THREE.CylinderGeometry(ringR(0.12) + 0.02, ringR(0.12) + 0.02, 0.16, 32), white, [0, 0.2, 0]));
      for (const [x, z] of [[0, 0], [0.08, 0.05], [-0.08, 0.05], [0.06, -0.07], [-0.06, -0.07]]) head.add(mesh(SPHERE, white, [x, 0.36, z], [0.11, 0.09, 0.11]));
      return 'flat';
    }
    case 'fire': {
      const shell = mat(0xc4282d, { roughness: 0.35 });
      head.add(mesh(shellGeometry((x, y) => y > 0.25), shell, [0, 0.02, 0], [HEAD[0] * 1.14, HEAD[1] * 1.16, HEAD[2] * 1.14]));
      head.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.016, 40, 1, false, Math.PI * 0.5, Math.PI), shell, [0, 0.07, -0.02]));
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xd4af37, { roughness: 0.3, metalness: 0.4 }), [0, 0.2, 0.24], [0.08, 0.1, 0.02]));
      return 'flat';
    }
    case 'scientist': {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.014, 8, 48), mat(0x2b2f33));
      strap.position.y = 0.17;
      strap.rotation.x = Math.PI / 2 - 0.1;
      head.add(strap);
      for (const s of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 20), mat(0x2b2f33), [s * 0.075, 0.19, 0.2]);
        cup.rotation.x = Math.PI / 2 - 0.5;
        head.add(cup);
        head.add(mesh(SPHERE, mat(0x8fd6ff, { roughness: 0.05, transparent: true, opacity: 0.75 }), [s * 0.075, 0.2, 0.218], [0.04, 0.04, 0.01]));
      }
      return 'keep';
    }
    case 'viking': {
      const metal = mat(0x9aa1a8, { roughness: 0.3, metalness: 0.35 });
      head.add(mesh(shellGeometry((x, y) => y > 0.28), metal, [0, 0.02, 0], [HEAD[0] * 1.12, HEAD[1] * 1.12, HEAD[2] * 1.12]));
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), metal, [0, 0.03, onFace(0, 0.03) + 0.02], [0.03, 0.11, 0.02]));
      const horn = mat(0xf0e6cc, { roughness: 0.5 });
      for (const s of [-1, 1]) {
        const h = mesh(new THREE.ConeGeometry(0.045, 0.2, 16), horn, [s * 0.25, 0.22, 0]);
        h.rotation.z = -s * 1.0;
        head.add(h);
      }
      return 'flat';
    }
    case 'samurai': {
      const dark = mat(c.armor, { roughness: 0.4, metalness: 0.2 });
      head.add(mesh(shellGeometry((x, y) => y > 0.2), dark, [0, 0.02, 0], [HEAD[0] * 1.14, HEAD[1] * 1.14, HEAD[2] * 1.14]));
      head.add(mesh(new THREE.CylinderGeometry(0.27, 0.36, 0.13, 40, 1, true, Math.PI * 0.6, Math.PI * 0.8), mat(c.armor, { side: THREE.DoubleSide, roughness: 0.4 }), [0, 0, -0.02]));
      head.add(mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32, Math.PI), mat(c.trim, { roughness: 0.25, metalness: 0.5 }), [0, 0.28, 0.17]));
      return 'flat';
    }
    case 'zombie': {
      for (const s of [-1, 1]) head.add(mesh(SPHERE_LO, mat(0x5f6e4a, { roughness: 0.8 }), [s * 0.085, -0.015, onFace(0.085, -0.015) - 0.004], [0.04, 0.018, 0.01]));
      return 'keep';
    }
    case 'mummy': {
      const wrap = mat(0xffffff, {
        roughness: 0.95,
        map: textTexture((g, w, h) => {
          g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, w, h);
          g.strokeStyle = 'rgba(120,100,70,.45)'; g.lineWidth = 3;
          for (let y = 0; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 9); g.stroke(); }
        }),
      });
      const eyes = (x, y, z) => z > 0.45 && Math.abs(y - 0.13) < 0.12 && Math.abs(x) < 0.62;
      head.add(mesh(shellGeometry((x, y, z) => !eyes(x, y, z)), wrap, [0, 0, 0], [HEAD[0] * 1.05, HEAD[1] * 1.05, HEAD[2] * 1.05]));
      return 'nohair';
    }
    case 'dino': {
      snugHood(head, mat(c.suit, { roughness: 0.85 }));
      const spike = mat(c.trim, { roughness: 0.6 });
      for (let i = 0; i < 4; i++) {
        const ang = -0.3 + i * 0.5;
        const sp = mesh(new THREE.ConeGeometry(0.035, 0.08, 4), spike, [0, Math.cos(ang) * 0.3, Math.sin(ang) * -0.3]);
        sp.rotation.x = -ang;
        head.add(sp);
      }
      return 'nohair';
    }
    case 'armor': {
      spaceHelmet(head, mat(c.armor, { roughness: 0.35, metalness: 0.3 }));
      return 'replace';
    }
    case 'hunter': {
      const plate = mat(c.armor, { roughness: 0.5, metalness: 0.25 });
      head.add(mesh(SPHERE, plate, [0, 0.03, -0.005], [0.27, 0.3, 0.28]));
      // Narrow horizontal visor slit and cheek plates.
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x101214, { roughness: 0.1, metalness: 0.5 }), [0, 0.045, 0.262], [0.24, 0.035, 0.03]));
      for (const s of [-1, 1]) head.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(c.trim, { roughness: 0.6 }), [s * 0.13, -0.07, 0.22], [0.07, 0.12, 0.06]));
      head.add(mesh(new THREE.BoxGeometry(1, 1, 1), plate, [0, -0.16, 0.2], [0.14, 0.05, 0.08]));
      return 'replace';
    }
    case 'fox': case 'cat': case 'bear': {
      const cloth = mat(c.suit, { roughness: 0.85 });
      snugHood(head, cloth);
      const inner = mat(c.trim, { roughness: 0.8 });
      for (const s of [-1, 1]) {
        if (c.head === 'bear') {
          head.add(mesh(SPHERE, cloth, [s * 0.16, 0.24, -0.02], [0.07, 0.07, 0.04]));
          head.add(mesh(SPHERE, inner, [s * 0.16, 0.24, 0.012], [0.04, 0.04, 0.02]));
        } else {
          const tall = c.head === 'fox' ? 0.19 : 0.12;
          const ear = mesh(new THREE.ConeGeometry(0.075, tall, 4), cloth, [s * 0.14, 0.235 + tall * 0.35, -0.02]);
          ear.rotation.z = -s * 0.32;
          ear.rotation.y = Math.PI / 4;
          head.add(ear);
          const earIn = mesh(new THREE.ConeGeometry(0.045, tall * 0.7, 4), inner, [s * 0.138, 0.23 + tall * 0.32, 0.012]);
          earIn.rotation.copy(ear.rotation);
          head.add(earIn);
        }
      }
      return 'nohair';
    }
    case 'hero': {
      // Cowl over the head and upper face, with white eye slits.
      const cowl = mat(c.suit, { roughness: 0.55 });
      const eyeHole = (x, y, z) => z > 0.55 && ((Math.abs(x) - 0.36) / 0.22) ** 2 + ((y - 0.13) / 0.14) ** 2 < 1;
      head.add(mesh(shellGeometry((x, y, z) => y > -0.05 && !eyeHole(x, y, z)), cowl, [0, 0, 0], [HEAD[0] * 1.06, HEAD[1] * 1.05, HEAD[2] * 1.1]));
      return 'nohair';
    }
    default: return 'keep';
  }
}

export function buildAvatar(input) {
  const base = normalizeLook(input);
  const c = costumeOf(base);
  const l = c && c.skin ? { ...base, skin: c.skin } : base;
  const bx = (BUILD[l.build] || 1) * (c && c.bulky ? 1.12 : 1);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  root.scale.setScalar({ short: 0.92, average: 1, tall: 1.07 }[l.height] || 1);

  let suitM = c ? mat(c.suit, c.metal ? { roughness: 0.25, metalness: 0.35 } : { roughness: 0.7 }) : null;
  if (c && c.tex === 'bandage') {
    suitM = mat(0xffffff, {
      roughness: 0.95,
      map: textTexture((g, w, h) => {
        g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(120,100,70,.45)'; g.lineWidth = 3;
        for (let y = 0; y < h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 8); g.stroke(); }
      }),
    });
  }
  const suit = c ? { m: suitM, trim: c.trim, gloves: c.head === 'robot' || c.head === 'knight' ? suitM : mat(c.head === 'astronaut' ? 0xffffff : 0x1c1d20, { roughness: 0.6 }) } : null;
  const pantsM = c && c.pants ? mat(c.pants, { roughness: 0.75 }) : suit ? suitM : mat(l.bottomsColor, { roughness: l.bottoms === 'sweats' ? 0.95 : 0.75 });
  const skin = mat(l.skin, { roughness: 0.55 });
  const shoeM = c ? mat(c.metal ? c.suit : 0x222326, c.metal ? { roughness: 0.25, metalness: 0.35 } : { roughness: 0.5 }) : mat(l.shoes, { roughness: 0.5 });
  const sole = mat(c ? 0x2b2f33 : 0xf2f2f2, { roughness: 0.6 });

  // Shoes / boots.
  for (const s of [-1, 1]) {
    const boot = c ? 1.15 : 1;
    body.add(mesh(SPHERE, shoeM, [s * 0.095 * bx, 0.058, 0.045], [0.066, 0.06 * boot, 0.125]));
    body.add(mesh(new THREE.CylinderGeometry(1, 1, 1, 24), sole, [s * 0.095 * bx, 0.012, 0.045], [0.068, 0.024, 0.128]));
    if (c) body.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 20), shoeM, [s * 0.095 * bx, 0.15, 0]));
  }

  // Legs: thigh and shin with a knee.
  const robe = c && c.robe;
  const bare = !c && (l.bottoms === 'shorts' || l.bottoms === 'skirt');
  for (const s of [-1, 1]) {
    const thighM = bare ? skin : pantsM;
    const leg = new THREE.Group();
    leg.position.set(s * 0.095 * bx, 0.84, 0);
    leg.add(segment(0.08, 0.06, 0.36, l.bottoms === 'shorts' && !c ? pantsM : thighM));
    if (l.bottoms === 'shorts' && !c) leg.add(mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.18, 20), skin, [0, -0.27, 0]));
    const knee = segment(0.058, 0.044, 0.34, bare ? skin : pantsM);
    knee.position.y = -0.36;
    leg.add(knee);
    if (!c && l.bottoms === 'cargo') leg.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(shade(l.bottomsColor, -0.08), { roughness: 0.8 }), [s * 0.07, -0.2, 0], [0.025, 0.09, 0.07]));
    if (c && c.armor) leg.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(c.armor), [0, -0.5, 0.045], [0.08, 0.14, 0.03]));
    if (!c && l.bottoms === 'sweats') {
      const cuff = mesh(new THREE.TorusGeometry(0.046, 0.014, 8, 24), pantsM, [0, -0.68, 0]);
      cuff.rotation.x = Math.PI / 2;
      leg.add(cuff);
      leg.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.7 }), [s * 0.07, -0.3, 0], [0.006, 0.55, 0.02]));
    }
    if (c && c.stripes) {
      const band = mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 24), mat(c.trim, { emissive: c.trim, emissiveIntensity: 0.25 }), [0, -0.55, 0]);
      band.rotation.x = Math.PI / 2;
      leg.add(band);
    }
    body.add(leg);
  }
  if (robe) body.add(mesh(new THREE.CylinderGeometry(0.17 * bx, 0.34 * bx, 0.78, 36), suitM, [0, 0.47, 0]));
  if (!c && l.bottoms === 'skirt') body.add(mesh(new THREE.CylinderGeometry(0.18 * bx, 0.3 * bx, 0.36, 32), pantsM, [0, 0.7, 0]));
  body.add(mesh(SPHERE, pantsM, [0, 0.86, 0], [0.19 * bx, 0.1, 0.12]));

  // Torso: chest wider than the waist.
  const topM = suit ? suitM : topMaterial(l);
  const profile = [[0.001, 0], [0.15, 0], [0.155, 0.05], [0.15, 0.14], [0.17, 0.26], [0.19, 0.36], [0.185, 0.42], [0.12, 0.47], [0.001, 0.48]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const torso = mesh(new THREE.LatheGeometry(profile, 40), topM, [0, 0.86, 0], [1.15 * bx, 1, 0.72], 'torso');
  body.add(torso);
  if (!c && l.top === 'hoodie') {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 12, 28), mat(shade(l.topColor, -0.07)));
    hood.position.set(0, 1.32, -0.015);
    hood.rotation.x = Math.PI / 2;
    body.add(hood);
    for (const s of [-1, 1]) body.add(mesh(cap(0.006, 0.11), mat(0xffffff), [s * 0.035, 1.2, 0.128]));
  }
  if (!c && l.top === 'jacket') body.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(shade(l.topColor, -0.2)), [0, 1.08, 0.128], [0.012, 0.42, 0.01]));
  // A flat panel on the front of the torso (shirt fronts, ties, straps...).
  const front = (x, y, w, h, col, z = 0.13, rz = 0) => {
    const m2 = mesh(new THREE.BoxGeometry(1, 1, 1), typeof col === 'object' ? col : mat(col, { roughness: 0.6 }), [x, y, z], [w, h, 0.012]);
    m2.rotation.z = rz;
    body.add(m2);
    return m2;
  };
  if (!c && l.top === 'suit') {
    front(0, 1.2, 0.09, 0.2, 0xf6f6f6);
    front(0, 1.17, 0.03, 0.16, l.topColor, 0.137);
    front(0, 1.07, 0.045, 0.06, l.topColor, 0.137, Math.PI / 4);
    for (const sgn of [-1, 1]) front(sgn * 0.06, 1.2, 0.03, 0.2, 0x1d1f24, 0.136, sgn * 0.35);
  }
  if (!c && l.top === 'vest') {
    front(0, 1.22, 0.07, 0.12, 0xf2f2f2);
    for (let i = 0; i < 3; i++) body.add(mesh(SPHERE_LO, mat(0xd4af37, { roughness: 0.3, metalness: 0.4 }), [0, 1.13 - i * 0.07, 0.135], [0.01, 0.01, 0.006]));
  }
  if (!c && l.top === 'tank') front(0, 1.25, 0.12, 0.06, l.skin, 0.12);
  if (!c && l.bottoms === 'overalls') {
    front(0, 1.04, 0.2, 0.2, pantsM, 0.132);
    for (const sgn of [-1, 1]) front(sgn * 0.08, 1.24, 0.035, 0.2, pantsM, 0.132, sgn * 0.12);
    for (const sgn of [-1, 1]) body.add(mesh(SPHERE_LO, mat(0xd4af37, { roughness: 0.3, metalness: 0.4 }), [sgn * 0.075, 1.15, 0.14], [0.014, 0.014, 0.006]));
  }
  if (l.extras === 'scarf') {
    const sm = mat(l.hatColor === '#2b2f33' ? '#c4282d' : l.hatColor, { roughness: 0.9 });
    const ring = mesh(new THREE.TorusGeometry(0.085, 0.04, 12, 32), sm, [0, 1.32, 0]);
    ring.rotation.x = Math.PI / 2;
    body.add(ring);
    front(0.05, 1.16, 0.06, 0.24, sm, 0.15, 0.1);
  } else if (l.extras === 'backpack') {
    const bm = mat(0x2c7fd0, { roughness: 0.7 });
    body.add(mesh(new THREE.BoxGeometry(1, 1, 1), bm, [0, 1.08, -0.16], [0.26, 0.32, 0.1]));
    for (const sgn of [-1, 1]) front(sgn * 0.1, 1.15, 0.03, 0.3, bm, 0.131);
  } else if (l.extras === 'necklace') {
    const gold = mat(0xd4af37, { roughness: 0.25, metalness: 0.5 });
    const chain = mesh(new THREE.TorusGeometry(0.075, 0.005, 6, 40), gold, [0, 1.3, 0.03]);
    chain.rotation.x = Math.PI / 2 - 0.5;
    body.add(chain);
    body.add(mesh(SPHERE_LO, gold, [0, 1.24, 0.11], [0.018, 0.022, 0.008]));
  } else if (l.extras === 'neckphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 32, Math.PI), mat(0x2b2f33));
    band.position.set(0, 1.33, -0.02);
    band.rotation.x = Math.PI / 2;
    band.rotation.z = Math.PI;
    body.add(band);
    for (const sgn of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20), mat(0xc4282d, { roughness: 0.4 }), [sgn * 0.085, 1.31, 0.05]);
      cup.rotation.z = Math.PI / 2;
      body.add(cup);
    }
  }
  if (!c && (l.top === 'hoodie' || l.top === 'tee')) {
    for (const [r, z, col] of [[0.04, 0.13, 0xffffff], [0.027, 0.133, l.topColor]]) {
      const disc = mesh(new THREE.CylinderGeometry(1, 1, 1, 32), mat(col, { roughness: 0.4 }), [0, 1.12, z], [r, 0.004, r]);
      disc.rotation.x = Math.PI / 2;
      body.add(disc);
    }
  }
  if (c) {
    const trimM = mat(c.trim, { roughness: 0.35 });
    body.add(mesh(new THREE.CylinderGeometry(0.175 * bx, 0.175 * bx, 0.04, 32), trimM, [0, 0.9, 0], [1.1, 1, 0.75]));
    if (c.armor) {
      const plate = mat(c.armor, { roughness: 0.4, metalness: 0.2 });
      body.add(mesh(SPHERE, plate, [0, 1.15, 0.05], [0.17 * bx, 0.15, 0.1]));
      for (const s of [-1, 1]) body.add(mesh(SPHERE, plate, [s * 0.235 * bx, 1.27, 0], [0.08, 0.06, 0.08]));
    }
    if (c.pack) body.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(c.head === 'hunter' ? 0x6a6e58 : 0xe2e2dc, { roughness: 0.6 }), [0, 1.1, -0.17], [0.26, 0.32, 0.12]));
    if (c.bulky) {
      // Big shoulder pads and a chest plate.
      const plate = mat(c.armor, { roughness: 0.4, metalness: 0.25 });
      for (const s of [-1, 1]) body.add(mesh(SPHERE, plate, [s * 0.26 * bx, 1.29, 0], [0.11, 0.08, 0.11]));
      body.add(mesh(new THREE.BoxGeometry(1, 1, 1), plate, [0, 1.16, 0.1], [0.3 * bx, 0.22, 0.06]));
    }
    if (c.tail) {
      const tm = mat(c.suit, { roughness: 0.85 });
      if (c.tail === 'fox') {
        // Tilted so it sweeps out behind and down from the lower back.
        const tail = mesh(SPHERE, tm, [0, 0.72, -0.32], [0.09, 0.22, 0.09]);
        tail.rotation.x = 0.9;
        body.add(tail);
        body.add(mesh(SPHERE, mat(0xffffff, { roughness: 0.85 }), [0, 0.6, -0.47], [0.065, 0.08, 0.065]));
      } else if (c.tail === 'cat') {
        const tail = mesh(cap(0.025, 0.42), tm, [0, 0.72, -0.3]);
        tail.rotation.x = 0.8;
        body.add(tail);
      } else {
        body.add(mesh(SPHERE, tm, [0, 0.8, -0.15], [0.06, 0.06, 0.06]));
      }
      // Hoodie front pocket.
      body.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(shade('#' + new THREE.Color(c.suit).getHexString(), -0.08), { roughness: 0.85 }), [0, 0.98, 0.125], [0.2, 0.1, 0.02]));
    }
    if (c.cape) {
      const cape = mesh(new THREE.CylinderGeometry(0.26 * bx, 0.42 * bx, 1.05, 32, 1, true, Math.PI * 0.62, Math.PI * 0.76), mat(c.suit, { roughness: 0.6, side: THREE.DoubleSide }), [0, 0.83, -0.02]);
      body.add(cape);
      const belt = mesh(new THREE.CylinderGeometry(0.178 * bx, 0.178 * bx, 0.05, 32), trimM, [0, 0.9, 0], [1.12, 1, 0.78]);
      body.add(belt);
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        body.add(mesh(new THREE.BoxGeometry(1, 1, 1), trimM, [Math.sin(a) * 0.2 * bx, 0.89, Math.cos(a) * 0.14], [0.04, 0.05, 0.03]));
      }
      const star = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 5), trimM, [0, 1.16, 0.135]);
      star.rotation.x = Math.PI / 2;
      body.add(star);
    }
    if (c.coat) {
      front(0, 1.12, 0.07, 0.36, c.under, 0.131);
      body.add(mesh(new THREE.CylinderGeometry(0.19 * bx, 0.27 * bx, 0.5, 36, 1, true, Math.PI * 0.12, Math.PI * 1.76), mat(c.suit, { roughness: 0.7, side: THREE.DoubleSide }), [0, 0.66, 0], [1, 1, 0.8]));
      if (c.head === 'pirate') {
        body.add(mesh(new THREE.CylinderGeometry(0.178 * bx, 0.178 * bx, 0.04, 32), mat(0x1d1f22), [0, 0.92, 0], [1.12, 1, 0.78]));
        front(0, 0.92, 0.05, 0.05, mat(c.trim, { roughness: 0.3, metalness: 0.4 }), 0.14);
      }
    }
    if (c.vest) for (const sgn of [-1, 1]) front(sgn * 0.08, 1.1, 0.1, 0.36, c.vest, 0.132);
    if (c.head === 'cowboy') front(0, 1.25, 0.12, 0.08, c.trim, 0.135, Math.PI);
    if (c.buttons) {
      for (let i = 0; i < 3; i++) for (const sgn of [-1, 1]) body.add(mesh(SPHERE_LO, mat(0x2b2f33), [sgn * 0.05, 1.18 - i * 0.08, 0.135], [0.01, 0.01, 0.006]));
      const tie = mesh(new THREE.TorusGeometry(0.075, 0.025, 8, 28), mat(c.trim, { roughness: 0.8 }), [0, 1.31, 0.02]);
      tie.rotation.x = Math.PI / 2;
      body.add(tie);
    }
    if (c.stripes) {
      const refl = mat(c.trim, { emissive: c.trim, emissiveIntensity: 0.25 });
      for (const y of [0.98, 1.16]) body.add(mesh(new THREE.CylinderGeometry(0.19 * bx, 0.19 * bx, 0.035, 32, 1, true), refl, [0, y, 0], [1.15, 1, 0.75]));
    }
    if (c.fur) {
      const fur = mesh(new THREE.TorusGeometry(0.19 * bx, 0.06, 12, 36), mat(0x8a6a4a, { roughness: 1 }), [0, 1.3, 0]);
      fur.rotation.x = Math.PI / 2;
      fur.scale.set(1.15, 0.8, 1);
      body.add(fur);
    }
    if (c.plates) {
      const plate = mat(c.armor, { roughness: 0.4, metalness: 0.2 });
      const gold = mat(c.trim, { roughness: 0.25, metalness: 0.5 });
      body.add(mesh(new THREE.BoxGeometry(1, 1, 1), plate, [0, 1.13, 0.1], [0.3 * bx, 0.26, 0.05]));
      for (let i = 0; i < 3; i++) front(0, 1.04 + i * 0.08, 0.28 * bx, 0.008, gold, 0.128);
      body.add(mesh(new THREE.CylinderGeometry(0.2 * bx, 0.28 * bx, 0.26, 36, 1, true), mat(c.armor, { roughness: 0.4, side: THREE.DoubleSide }), [0, 0.76, 0], [1, 1, 0.8]));
      for (const sgn of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(1, 1, 1), plate, [sgn * 0.27 * bx, 1.24, 0], [0.12, 0.1, 0.14]));
    }
    if (c.torn) {
      const rag = mat(c.trim, { roughness: 1 });
      for (const [x, y] of [[-0.08, 1.05], [0.1, 1.15], [0.02, 0.95]]) front(x, y, 0.05, 0.04, rag, 0.132, x * 4);
    }
    if (c.tail === 'dino') {
      const tail = mesh(new THREE.ConeGeometry(0.1, 0.5, 20), mat(c.suit, { roughness: 0.85 }), [0, 0.7, -0.33]);
      tail.rotation.x = -1.2;
      body.add(tail);
      for (let i = 0; i < 4; i++) {
        const sp = mesh(new THREE.ConeGeometry(0.03, 0.07, 4), mat(c.trim, { roughness: 0.6 }), [0, 1.25 - i * 0.12, -0.13 - i * 0.01]);
        sp.rotation.x = -Math.PI / 2;
        body.add(sp);
      }
      front(0, 1.05, 0.2, 0.32, mat(c.trim, { roughness: 0.85 }), 0.125);
    }
    if (c.head === 'pilot') body.add(mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xf2f2f2), [0, 1.08, 0.13], [0.12, 0.1, 0.02]));
    if (c.head === 'robot') {
      const light = mesh(new THREE.CylinderGeometry(1, 1, 1, 24), mat(0x29d4ff, { emissive: 0x29d4ff, emissiveIntensity: 0.8 }), [0, 1.12, 0.13], [0.04, 0.005, 0.04]);
      light.rotation.x = Math.PI / 2;
      body.add(light);
    }
    if (robe) {
      const sash = mesh(new THREE.TorusGeometry(0.16 * bx, 0.016, 8, 40), trimM, [0, 0.98, 0]);
      sash.rotation.x = Math.PI / 2;
      sash.scale.set(1.1, 0.75, 1);
      body.add(sash);
    }
  }

  // Arms, held slightly away from the body.
  for (const s of [-1, 1]) {
    const arm = buildArm(l, s, suit);
    arm.position.set(s * 0.24 * bx, 1.27, 0);
    arm.rotation.z = s * 0.14;
    body.add(arm);
  }

  // Neck and head.
  body.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 20), c && c.head === 'robot' ? suitM : skin, [0, 1.36, 0]));
  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(0, 1.4, 0);
  let head;
  if (c) {
    const probe = new THREE.Group();
    const mode = costumeHead(l, c, probe);
    if (mode === 'replace') head = probe;
    else {
      const longHair = ['long', 'bob', 'braids', 'ponytail', 'pigtails'].includes(l.hairStyle);
      const hairStyle = mode === 'nohair' ? 'bald' : mode === 'flat' && !longHair ? 'buzz' : l.hairStyle;
      head = buildHead({ ...l, hairStyle, hat: 'none', glasses: mode === 'keep' ? l.glasses : 'none' });
      for (const ch of [...probe.children]) head.add(ch);
    }
    head.name = 'head';
  } else {
    head = buildHead(l);
  }
  head.position.set(0, 0.25, 0.01);
  headPivot.add(head);
  body.add(headPivot);
  return root;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      if (![SPHERE, SPHERE_LO].includes(o.geometry)) o.geometry.dispose();
      const m = o.material;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a80, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-1.5, 2.8, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfffd0, 1.6);
  rim.position.set(2, 2, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(2, 0.5, 2);
  scene.add(fill);
}

function floorShadow() {
  const tex = textTexture((g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.42)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

const VIEWS = {
  full: { pos: [0, 1.05, 4.9], target: [0, 0.98, 0], fov: 26 },
  head: { pos: [0, 1.66, 1.5], target: [0, 1.62, 0], fov: 26 },
  // Head and upper body: the editor's view for facial features, so you
  // still see the whole look change.
  bust: { pos: [0, 1.42, 3.0], target: [0, 1.4, 0], fov: 26 },
};

// One avatar's moving parts and idle timers, so several can share a scene
// and still fidget on their own.
function makeActor(root, now = performance.now()) {
  const parts = {
    body: root.getObjectByName('body'),
    head: root.getObjectByName('headPivot'),
    armL: root.getObjectByName('armL'),
    armR: root.getObjectByName('armR'),
    lids: [],
  };
  parts.elbowL = parts.armL && parts.armL.getObjectByName('elbow');
  parts.elbowR = parts.armR && parts.armR.getObjectByName('elbow');
  root.traverse((o) => { if (o.name === 'lid') parts.lids.push(o); });
  return { root, parts, t0: now, action: null, nextAction: 0, waveUntil: 0, nextBlink: now + 2500 };
}

function poseActor(actor, now) {
const p = actor.parts;
  const t = (now - actor.t0) / 1000;
  p.body.scale.y = 1 + Math.sin(t * 1.7) * 0.006;
  p.head.rotation.y = Math.sin(t * 0.45) * 0.25 + Math.sin(t * 1.3) * 0.04;
  p.head.rotation.x = Math.sin(t * 0.7) * 0.04;
  p.head.rotation.z = 0;
  p.armL.rotation.set(0, 0, -0.1 - Math.sin(t * 1.7) * 0.02);
  p.armR.rotation.set(0, 0, 0.1 + Math.sin(t * 1.7) * 0.02);
  if (p.elbowL) p.elbowL.rotation.x = -0.12;
  if (p.elbowR) p.elbowR.rotation.x = -0.12;
  p.body.position.set(0, 0, 0);
  p.body.rotation.z = 0;

  // Now and then an idle action, like the console avatars fidgeting.
  if (!actor.action && now > (actor.nextAction || (actor.nextAction = now + 6000))) {
    const names = ['stretch', 'watch', 'shift', 'wave'];
    actor.action = { name: names[Math.floor(Math.random() * names.length)], start: now, dur: 2600 };
  }
  if (now < actor.waveUntil) actor.action = { name: 'celebrate', start: actor.waveUntil - 1800, dur: 1800 };
  const a = actor.action;
  if (a) {
    const k = Math.min(1, (now - a.start) / a.dur);
    const ease = Math.sin(k * Math.PI); // 0 → 1 → 0
    if (a.name === 'celebrate') {
      p.armL.rotation.z = -0.1 - ease * 2.6;
      p.armR.rotation.z = 0.1 + ease * 2.6;
      p.body.position.y = Math.max(0, Math.sin(k * Math.PI * 3)) * 0.06 * ease;
    } else if (a.name === 'stretch') {
      p.armL.rotation.z = -0.1 - ease * 2.9;
      p.armR.rotation.z = 0.1 + ease * 2.9;
      p.head.rotation.x = -ease * 0.25;
      p.body.scale.y += ease * 0.015;
    } else if (a.name === 'watch') {
      p.armL.rotation.x = -ease * 1.1;
      p.armL.rotation.z = -0.1 + ease * 0.35;
      if (p.elbowL) p.elbowL.rotation.x = -0.12 - ease * 1.5;
      p.head.rotation.x = ease * 0.35;
      p.head.rotation.y = ease * 0.3;
    } else if (a.name === 'shift') {
      p.body.rotation.z = Math.sin(k * Math.PI * 2) * 0.05;
      p.head.rotation.z = -Math.sin(k * Math.PI * 2) * 0.06;
    } else if (a.name === 'wave') {
      p.armR.rotation.z = 0.1 + ease * 2.4 + Math.sin(t * 14) * 0.22 * ease;
    }
    if (k >= 1) { actor.action = null; actor.nextAction = now + 8000 + Math.random() * 6000; }
  }
  const blink = now > actor.nextBlink && now < actor.nextBlink + 130;
  if (now > actor.nextBlink + 130) actor.nextBlink = now + 2500 + Math.random() * 3500;
  for (const lid of p.lids) lid.visible = blink;
}

// One avatar on one canvas, animated.
export class AvatarView {
  constructor(canvas, { view = 'full', animate = true } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !animate });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    lights(this.scene);
    this.scene.add(floorShadow());
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    this.turn = 0;
    this.targetTurn = 0;
    this.animate = animate;
    this.setView(view, true);
    this.avatar = null;
    this.actor = null;
    this.running = false;
  }

  setView(view, instant = false) {
    this.view = VIEWS[view] || VIEWS.full;
    this.camFrom = instant ? null : { pos: this.camera.position.clone(), target: this.camTarget ? this.camTarget.clone() : new THREE.Vector3(...this.view.target) };
    this.camT = instant ? 1 : 0;
    if (instant) {
      this.camera.position.set(...this.view.pos);
      this.camTarget = new THREE.Vector3(...this.view.target);
      this.camera.lookAt(this.camTarget);
    }
  }

  setLook(look) {
    if (this.avatar) {
      this.scene.remove(this.avatar);
      disposeTree(this.avatar);
    }
    this.actor = makeActor(buildAvatar(look));
    this.avatar = this.actor.root;
    this.scene.add(this.avatar);
    this.parts = this.actor.parts;
    this.render();
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.width;
    const h = this.canvas.clientHeight || this.canvas.height;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  wave() { if (this.actor) this.actor.waveUntil = performance.now() + 1800; }
  rotateBy(rad) { this.targetTurn += rad; }

  start() {
    if (this.running || !this.animate) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }

  pose(now) {
    if (this.actor && this.animate) poseActor(this.actor, now);
  }

  render() {
    const now = performance.now();
    this.resize();
    if (this.avatar) {
      this.turn += (this.targetTurn - this.turn) * 0.15;
      this.avatar.rotation.y = this.turn;
    }
    if (this.camT < 1 && this.camFrom) {
      this.camT = Math.min(1, this.camT + 0.06);
      const e = 1 - (1 - this.camT) ** 3;
      this.camera.position.lerpVectors(this.camFrom.pos, new THREE.Vector3(...this.view.pos), e);
      this.camTarget = this.camFrom.target.clone().lerp(new THREE.Vector3(...this.view.target), e);
    }
    this.camera.fov = this.view.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camTarget);
    this.pose(now);
    this.renderer.render(this.scene, this.camera);
  }
}

// Several avatars standing side by side on one canvas (the sign-in
// screen), each idling on its own. slots() places them over HTML slots:
// pass each slot's centre as a 0..1 fraction of the canvas width.
export class AvatarLineup {
  constructor(canvas) {
    this.view = new AvatarView(canvas, { view: 'full' });
    this.view.pose = (now) => this.pose(now);
    this.actors = [];
    this.focused = -1;
  }

  setLooks(looks) {
    const { scene } = this.view;
    for (const a of this.actors) { scene.remove(a.group); disposeTree(a.group); }
    const now = performance.now();
    this.actors = looks.map((look, i) => {
      const group = new THREE.Group();
      const actor = makeActor(buildAvatar(look), now - i * 1700);
      // Stagger the first fidgets so they don't move in step.
      actor.nextAction = now + 2500 + i * 2300 + Math.random() * 2000;
      group.add(actor.root);
      group.add(floorShadow());
      scene.add(group);
      return Object.assign(actor, { group, x: 0, z: 0, scale: 0.82 });
    });
    // The view's own shadow sits at the centre; the lineup draws one each.
    scene.children.filter((o) => o.isMesh && !this.actors.some((a) => a.group === o)).forEach((o) => { o.visible = false; });
  }

  // fractions: each avatar's slot centre (0..1 of the width); count: how
  // many slots share the width, so avatars shrink to fit narrow ones.
  slots(fractions, count = fractions.length) { this.fractions = fractions; this.slotCount = count; }

  focus(i) {
    if (i === this.focused) return;
    this.focused = i;
    const a = this.actors[i];
    if (a) a.waveUntil = performance.now() + 1800;
  }

  pose(now) {
    const cam = this.view.camera;
    const dist = cam.position.z;
    const halfW = Math.tan((cam.fov * Math.PI) / 360) * dist * cam.aspect;
    const n = this.actors.length;
    // An avatar is about 0.8 wide with its arms out a little.
    const fit = Math.min(1, (2 * halfW) / (this.slotCount || n) / 0.8);
    this.actors.forEach((a, i) => {
      const f = this.fractions && this.fractions[i] != null ? this.fractions[i] : (i + 0.5) / n;
      const on = i === this.focused;
      // Ease towards the slot; the focused avatar steps forward.
      a.x += ((f * 2 - 1) * halfW - a.x) * 0.15;
      a.z += ((on ? 0.2 : 0) - a.z) * 0.12;
      a.scale += ((on ? 0.92 : 0.82) * fit - a.scale) * 0.12;
      a.group.position.set(a.x * (dist - a.z) / dist, 0, a.z);
      a.group.scale.setScalar(a.scale);
      poseActor(a, now);
    });
  }

  start() { this.view.start(); }
  stop() { this.view.stop(); }

  dispose() {
    this.stop();
    for (const a of this.actors) disposeTree(a.group);
    this.view.renderer.dispose();
  }
}

// Renders still pictures (option cards, gamerpic) with one shared context.
let snapView = null;
export function snapshot(look, { view = 'full', size = 160 } = {}) {
  if (!snapView) {
    const c = document.createElement('canvas');
    snapView = new AvatarView(c, { view, animate: false });
  }
  const c = snapView.canvas;
  c.width = size;
  c.height = size;
  c.style.width = size + 'px';
  c.style.height = size + 'px';
  snapView.renderer.setSize(size, size, false);
  snapView.camera.aspect = 1;
  snapView.setView(view, true);
  snapView.setLook(look);
  snapView.render();
  return c.toDataURL('image/png');
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
