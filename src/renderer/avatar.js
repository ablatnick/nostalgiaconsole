// Cartoon avatars in the spirit of the 2008 dashboard: big head, small
// body, built from interchangeable parts so they can be customized.
// Pure SVG; the dashboard animates the av-* groups with CSS.

const C = {
  skin: ['#ffe0c4', '#f1c7a0', '#e0ac7e', '#c68a5c', '#a5683e', '#7d4b2a', '#5a3420', '#3e2416'],
  hair: ['#1c1714', '#3b2416', '#6b4428', '#a87443', '#e2bc6e', '#b4492c', '#9a9a9a', '#f2f2f2', '#3a6fd8', '#e35fa8', '#58b33a'],
  eyes: ['#3a6fa8', '#5b3a22', '#3f7d3a', '#8a6a2e', '#6f7c86', '#2b2b2b'],
  cloth: ['#5aa51e', '#2c7fd0', '#e0632a', '#7d58c6', '#c4282d', '#f0b000', '#1aa3a3', '#2b2f33', '#f2f2f2', '#e35fa8', '#7a5a3a', '#3a5a86'],
  shoes: ['#f4f4f4', '#2b2f33', '#c4282d', '#2c7fd0', '#5aa51e', '#7a5a3a', '#f0b000'],
};

// Every customizable part: its choices, and whether the editor should
// zoom in on the face while you pick it.
export const PARTS = [
  { key: 'build', group: 'my features', label: 'body type', values: ['slim', 'regular', 'broad'] },
  { key: 'skin', group: 'my features', label: 'skin tone', colors: C.skin, face: true },
  { key: 'hairStyle', group: 'my features', label: 'hair style', values: ['short', 'spiky', 'long', 'bob', 'buzz', 'curly', 'mohawk', 'ponytail', 'bald'], face: true },
  { key: 'hairColor', group: 'my features', label: 'hair color', colors: C.hair, face: true },
  { key: 'eyes', group: 'my features', label: 'eyes', values: ['round', 'wide', 'happy', 'sleepy', 'narrow'], face: true },
  { key: 'eyeColor', group: 'my features', label: 'eye color', colors: C.eyes, face: true },
  { key: 'brows', group: 'my features', label: 'eyebrows', values: ['arched', 'flat', 'raised', 'angry', 'none'], face: true },
  { key: 'mouth', group: 'my features', label: 'mouth', values: ['smile', 'grin', 'smirk', 'open', 'flat'], face: true },
  { key: 'facialHair', group: 'my features', label: 'facial hair', values: ['none', 'stubble', 'mustache', 'goatee', 'beard'], face: true },
  { key: 'glasses', group: 'my style', label: 'glasses', values: ['none', 'round', 'square', 'shades', 'visor'], face: true },
  { key: 'hat', group: 'my style', label: 'hat', values: ['none', 'cap', 'beanie', 'headphones', 'tophat', 'crown'], face: true },
  { key: 'hatColor', group: 'my style', label: 'hat color', colors: C.cloth, face: true },
  { key: 'top', group: 'my style', label: 'top', values: ['hoodie', 'tee', 'jacket', 'jersey', 'sweater'] },
  { key: 'topColor', group: 'my style', label: 'top color', colors: C.cloth },
  { key: 'bottoms', group: 'my style', label: 'bottoms', values: ['jeans', 'cargo', 'shorts', 'skirt'] },
  { key: 'bottomsColor', group: 'my style', label: 'bottoms color', colors: C.cloth.slice().reverse() },
  { key: 'shoes', group: 'my style', label: 'shoes', colors: C.shoes },
  { key: 'costume', group: 'costumes', label: 'costume', values: ['none', 'robot', 'astronaut', 'pilot', 'trooper', 'robe', 'knight', 'ninja', 'wizard', 'alien'] },
];

export const DEFAULT_LOOK = {
  build: 'regular', skin: C.skin[1], hairStyle: 'short', hairColor: C.hair[2], eyes: 'round', eyeColor: C.eyes[0],
  brows: 'arched', mouth: 'smile', facialHair: 'none', glasses: 'none', hat: 'none', hatColor: C.cloth[7],
  top: 'hoodie', topColor: C.cloth[0], bottoms: 'jeans', bottomsColor: C.cloth[11], shoes: C.shoes[0], costume: 'none',
};

function choices(p) {
  return p.values || p.colors;
}

// Fills in anything missing or no longer offered with the default.
export function normalizeLook(look) {
  const out = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return out;
  for (const p of PARTS) if (choices(p).includes(look[p.key])) out[p.key] = look[p.key];
  return out;
}

export function randomLook() {
  const out = {};
  for (const p of PARTS) {
    const c = choices(p);
    out[p.key] = c[Math.floor(Math.random() * c.length)];
  }
  // Keep accessories occasional so random avatars look like people.
  if (Math.random() < 0.6) out.hat = 'none';
  if (Math.random() < 0.6) out.glasses = 'none';
  if (Math.random() < 0.6) out.facialHair = 'none';
  if (Math.random() < 0.8) out.costume = 'none';
  return out;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------- parts ----------

function hairBack(l) {
  const c = l.hairColor;
  switch (l.hairStyle) {
    case 'long': return `<path d="M44 92 Q38 36 100 30 Q162 36 156 92 L162 196 Q136 206 130 168 L70 168 Q64 206 38 196Z" fill="${shade(c, -0.06)}"/>`;
    case 'bob': return `<path d="M44 92 Q40 34 100 30 Q160 34 156 92 L158 150 Q140 160 132 140 L68 140 Q60 160 42 150Z" fill="${shade(c, -0.06)}"/>`;
    case 'ponytail': return `<ellipse cx="150" cy="128" rx="15" ry="44" transform="rotate(14 150 128)" fill="${shade(c, -0.08)}"/><circle cx="146" cy="78" r="9" fill="${shade(c, -0.15)}"/>`;
    case 'curly': return `<g fill="${shade(c, -0.06)}">${[[48, 98], [152, 98], [46, 124], [154, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="14"/>`).join('')}</g>`;
    default: return '';
  }
}

function hairFront(l) {
  const c = l.hairColor;
  switch (l.hairStyle) {
    case 'short': return `<path d="M46 92 Q44 36 100 34 Q158 36 154 92 Q150 66 128 58 Q110 70 76 62 Q54 70 46 92Z" fill="${c}"/>`;
    case 'spiky': return `<path d="M46 92 L48 52 L62 60 L64 30 L80 48 L90 20 L102 44 L116 18 L124 46 L140 28 L142 58 L154 52 L154 92 Q150 66 128 58 Q110 70 76 62 Q54 70 46 92Z" fill="${c}"/>`;
    case 'long': return `<path d="M46 100 Q42 34 100 32 Q158 34 154 100 Q146 62 112 56 Q96 72 60 70 Q50 82 46 100Z" fill="${c}"/>`;
    case 'bob': return `<path d="M46 98 Q44 32 100 31 Q156 32 154 98 Q142 68 100 70 Q58 68 46 98Z" fill="${c}"/>`;
    case 'buzz': return `<path d="M48 86 Q50 38 100 37 Q150 38 152 86 Q130 62 100 61 Q70 62 48 86Z" fill="${c}" fill-opacity=".72"/>`;
    case 'curly': return `<g fill="${c}">${[[56, 66], [70, 48], [88, 38], [108, 36], [128, 44], [144, 62], [52, 86], [150, 84], [80, 58], [118, 56], [100, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15"/>`).join('')}</g>`;
    case 'mohawk': return `<path d="M50 86 Q52 46 100 42 Q148 46 150 86 Q128 66 100 64 Q72 66 50 86Z" fill="${c}" fill-opacity=".4"/><path d="M90 66 L84 22 L96 30 L100 8 L106 30 L118 22 L110 66Z" fill="${c}"/>`;
    case 'ponytail': return `<path d="M46 94 Q44 34 100 33 Q158 34 154 94 Q148 62 100 58 Q60 60 46 94Z" fill="${c}"/>`;
    default: return '';
  }
}

function eyes(l) {
  const ec = l.eyeColor;
  const pupils = (r = 6.5, dy = 0) => `
    <circle cx="82" cy="${104 + dy}" r="${r}" fill="${ec}"/><circle cx="122" cy="${104 + dy}" r="${r}" fill="${ec}"/>
    <circle cx="82" cy="${104 + dy}" r="${r / 2}" fill="#111"/><circle cx="122" cy="${104 + dy}" r="${r / 2}" fill="#111"/>
    <circle cx="84" cy="${101 + dy}" r="1.8" fill="#fff"/><circle cx="124" cy="${101 + dy}" r="1.8" fill="#fff"/>`;
  const lid = `<rect class="av-lid" x="66" y="86" width="68" height="0" fill="${l.skin}"/>`;
  switch (l.eyes) {
    case 'wide': return `<ellipse cx="80" cy="102" rx="13" ry="16" fill="#fff"/><ellipse cx="120" cy="102" rx="13" ry="16" fill="#fff"/>${pupils(7.5)}${lid}`;
    case 'happy': return `<path d="M70 106 Q80 94 90 106" fill="none" stroke="#2b2b2b" stroke-width="4" stroke-linecap="round"/><path d="M110 106 Q120 94 130 106" fill="none" stroke="#2b2b2b" stroke-width="4" stroke-linecap="round"/>`;
    case 'sleepy': return `<ellipse cx="80" cy="104" rx="11" ry="10" fill="#fff"/><ellipse cx="120" cy="104" rx="11" ry="10" fill="#fff"/>${pupils(6, 2)}<rect x="66" y="92" width="28" height="10" fill="${l.skin}"/><rect x="106" y="92" width="28" height="10" fill="${l.skin}"/><path d="M68 102 H92 M108 102 H132" stroke="#000" stroke-opacity=".25" stroke-width="2"/>`;
    case 'narrow': return `<ellipse cx="80" cy="104" rx="12" ry="7" fill="#fff"/><ellipse cx="120" cy="104" rx="12" ry="7" fill="#fff"/>${pupils(5)}`;
    default: return `<ellipse cx="80" cy="102" rx="11" ry="13" fill="#fff"/><ellipse cx="120" cy="102" rx="11" ry="13" fill="#fff"/>${pupils()}${lid}`;
  }
}

function brows(l) {
  const c = l.hairColor === '#f2f2f2' ? '#bdbdbd' : l.hairColor;
  const pair = (a, b) => `<path d="${a}" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/><path d="${b}" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`;
  switch (l.brows) {
    case 'flat': return pair('M68 84 H92', 'M108 84 H132');
    case 'raised': return pair('M68 80 Q80 70 92 78', 'M108 78 Q120 70 132 80');
    case 'angry': return pair('M68 80 L92 88', 'M108 88 L132 80');
    case 'none': return '';
    default: return pair('M68 84 Q80 78 92 84', 'M108 84 Q120 78 132 84');
  }
}

function mouth(l) {
  switch (l.mouth) {
    case 'grin': return `<path d="M78 128 Q100 156 122 128 Z" fill="#7a2b22"/><path d="M80 129 H120 L118 135 H82Z" fill="#fff"/>`;
    case 'smirk': return `<path d="M86 136 Q104 142 118 128" fill="none" stroke="#7a3b2a" stroke-width="4" stroke-linecap="round"/>`;
    case 'open': return `<ellipse cx="100" cy="136" rx="10" ry="12" fill="#7a2b22"/><ellipse cx="100" cy="142" rx="6" ry="4" fill="#e0707a"/>`;
    case 'flat': return `<path d="M86 136 H114" stroke="#7a3b2a" stroke-width="4" stroke-linecap="round"/>`;
    default: return `<path d="M82 132 Q100 148 118 132" fill="none" stroke="#7a3b2a" stroke-width="4" stroke-linecap="round"/>`;
  }
}

function facialHair(l) {
  const c = l.hairColor;
  switch (l.facialHair) {
    case 'stubble': return `<path d="M54 118 Q60 164 100 166 Q140 164 146 118 Q138 150 100 154 Q62 150 54 118Z" fill="${c}" fill-opacity=".28"/>`;
    case 'mustache': return `<path d="M80 126 Q90 116 100 122 Q110 116 120 126 Q110 124 100 128 Q90 124 80 126Z" fill="${c}"/>`;
    case 'goatee': return `<path d="M80 126 Q90 116 100 122 Q110 116 120 126 Q110 124 100 128 Q90 124 80 126Z" fill="${c}"/><path d="M88 148 Q100 172 112 148 Q100 154 88 148Z" fill="${c}"/>`;
    case 'beard': return `<path d="M50 108 Q54 176 100 178 Q146 176 150 108 Q144 128 132 132 Q118 124 100 128 Q82 124 68 132 Q56 128 50 108Z" fill="${c}"/><path d="M84 134 Q100 146 116 134" fill="none" stroke="#7a3b2a" stroke-width="3.5" stroke-linecap="round"/>`;
    default: return '';
  }
}

function glasses(l) {
  switch (l.glasses) {
    case 'round': return `<g fill="none" stroke="#2b2b2b" stroke-width="3.5"><circle cx="80" cy="104" r="16"/><circle cx="120" cy="104" r="16"/><path d="M96 102 Q100 98 104 102 M64 100 L48 96 M136 100 L152 96"/></g>`;
    case 'square': return `<g fill="none" stroke="#2b2b2b" stroke-width="4"><rect x="62" y="92" width="34" height="24" rx="4"/><rect x="104" y="92" width="34" height="24" rx="4"/><path d="M96 102 H104 M62 98 L48 94 M138 98 L152 94"/></g>`;
    case 'shades': return `<g><path d="M60 92 H96 Q98 118 80 118 Q62 118 60 92Z M104 92 H140 Q138 118 120 118 Q102 118 104 92Z" fill="#141414"/><path d="M96 96 H104 M60 94 L48 92 M140 94 L152 92" stroke="#141414" stroke-width="4"/><path d="M66 96 L74 96 M110 96 L118 96" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/></g>`;
    case 'visor': return `<g><rect x="54" y="90" width="92" height="24" rx="12" fill="#29c7e8" fill-opacity=".8"/><rect x="58" y="93" width="84" height="6" rx="3" fill="#fff" fill-opacity=".55"/></g>`;
    default: return '';
  }
}

function hat(l) {
  const c = l.hatColor;
  switch (l.hat) {
    case 'cap': return `<path d="M44 84 Q44 26 100 24 Q156 26 156 84 Q100 70 44 84Z" fill="${c}"/><path d="M44 82 Q100 66 156 82 Q170 86 182 94 Q150 84 100 86 Q70 86 44 92Z" fill="${shade(c, -0.12)}"/><circle cx="100" cy="27" r="4" fill="${shade(c, -0.18)}"/>`;
    case 'beanie': return `<path d="M42 88 Q42 18 100 18 Q158 18 158 88Z" fill="${c}"/><rect x="40" y="74" width="120" height="18" rx="8" fill="${shade(c, -0.12)}"/><circle cx="100" cy="16" r="11" fill="${shade(c, 0.12)}"/>`;
    case 'headphones': return `<path d="M44 100 Q40 22 100 20 Q160 22 156 100" fill="none" stroke="#2b2f33" stroke-width="9"/><rect x="30" y="86" width="22" height="38" rx="9" fill="${c}"/><rect x="148" y="86" width="22" height="38" rx="9" fill="${c}"/>`;
    case 'tophat': return `<rect x="58" y="-6" width="84" height="64" rx="4" fill="#1d1f22"/><rect x="58" y="40" width="84" height="12" fill="${c}"/><ellipse cx="100" cy="60" rx="64" ry="9" fill="#1d1f22"/>`;
    case 'crown': return `<path d="M58 60 L62 22 L80 42 L100 14 L120 42 L138 22 L142 60Z" fill="#f2c230" stroke="#c99400" stroke-width="3"/><circle cx="100" cy="44" r="5" fill="${c}"/><circle cx="76" cy="50" r="4" fill="${c}"/><circle cx="124" cy="50" r="4" fill="${c}"/>`;
    default: return '';
  }
}

// Body parts use 360-style proportions: the head (drawn at its own scale
// and shrunk into place) is about a quarter of the height.
const CYL = '<path d="__D__" fill="url(#av-cyl)"/>';
const shaded = (d, fill) => `<path d="${d}" fill="${fill}"/>` + CYL.replace('__D__', d);

function torso(l) {
  const c = l.topColor;
  const T = 'M66 132 Q68 118 86 116 L114 116 Q132 118 134 132 L128 230 Q100 236 72 230 Z';
  const base = shaded(T, c);
  const logo = `<circle cx="100" cy="160" r="11" fill="#fff" fill-opacity=".92"/><circle cx="100" cy="160" r="7.5" fill="${c}"/><path d="M94 162 Q100 158 106 160" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-opacity=".85"/>`;
  switch (l.top) {
    case 'tee': return `${base}<path d="M88 116 Q100 130 112 116" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="2.5"/>${logo}`;
    case 'jacket': return `${base}<path d="M100 124 V230" stroke="${shade(c, -0.25)}" stroke-width="2.5"/><path d="M86 116 L100 136 L94 148 L80 124Z M114 116 L100 136 L106 148 L120 124Z" fill="${shade(c, -0.12)}"/><rect x="76" y="186" width="15" height="10" rx="2" fill="${shade(c, -0.15)}"/><rect x="109" y="186" width="15" height="10" rx="2" fill="${shade(c, -0.15)}"/>`;
    case 'jersey': return `${base}<path d="M88 116 L100 132 L112 116" fill="none" stroke="#fff" stroke-width="3.5"/><text x="100" y="186" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="30" fill="#fff" fill-opacity=".92">08</text>`;
    case 'sweater': return `${base}${[150, 172, 194].map((y) => `<rect x="68" y="${y}" width="64" height="7" fill="${shade(c, 0.18)}"/>`).join('')}<path d="M88 116 Q100 130 112 116" fill="none" stroke="${shade(c, -0.2)}" stroke-width="5"/>`;
    default: return `<path d="M78 120 Q100 142 122 120 Q118 110 100 110 Q82 110 78 120Z" fill="${shade(c, -0.12)}"/>${base}<path d="M88 116 Q100 132 112 116" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2.5"/>${logo}<path d="M95 130 L93 146 M105 130 L107 146" stroke="#fff" stroke-opacity=".8" stroke-width="1.8"/>`;
  }
}

function arms(l) {
  const c = l.topColor;
  const short = l.top === 'tee' || l.top === 'jersey';
  const longL = 'M70 122 Q56 126 54 150 L52 226 Q52 234 60 234 Q66 234 66 226 L68 152 Z';
  const longR = 'M130 122 Q144 126 146 150 L148 226 Q148 234 140 234 Q134 234 134 226 L132 152 Z';
  const shortL = 'M70 122 Q56 126 54 150 L54 164 L68 164 L68 150 Z';
  const shortR = 'M130 122 Q144 126 146 150 L146 164 L132 164 L132 150 Z';
  const foreL = 'M54 160 L52 226 Q52 234 60 234 Q66 234 66 226 L68 160 Z';
  const foreR = 'M146 160 L148 226 Q148 234 140 234 Q134 234 134 226 L132 160 Z';
  const side = (sleeve, fore, hx) => (short ? shaded(fore, l.skin) : '') + shaded(sleeve, c) + `<circle cx="${hx}" cy="240" r="8.5" fill="${l.skin}"/>`;
  return `<g class="av-arm-l">${side(short ? shortL : longL, foreL, 59)}</g><g class="av-arm-r">${side(short ? shortR : longR, foreR, 141)}</g>`;
}

function legs(l) {
  const c = l.bottomsColor;
  const legL = 'M74 226 L72 370 Q72 376 78 376 L96 376 L99 244 Z';
  const legR = 'M126 226 L128 370 Q128 376 122 376 L104 376 L101 244 Z';
  const skin = shaded('M76 250 L74 372 L96 372 L99 250 Z', l.skin) + shaded('M124 250 L126 372 L104 372 L101 250 Z', l.skin);
  const pants = shaded(legL, c) + shaded(legR, c) + `<path d="M73 224 L127 224 L127 246 L73 246 Z" fill="${c}"/>`;
  switch (l.bottoms) {
    case 'cargo': return `${pants}<rect x="70" y="276" width="14" height="18" rx="2" fill="${shade(c, -0.14)}"/><rect x="116" y="276" width="14" height="18" rx="2" fill="${shade(c, -0.14)}"/>`;
    case 'shorts': return `${skin}${shaded('M73 224 L127 224 L130 292 L104 294 L100 262 L96 294 L70 292 Z', c)}`;
    case 'skirt': return `${skin}${shaded('M73 224 L127 224 L140 300 Q100 312 60 300 Z', c)}`;
    default: return `${pants}<path d="M100 244 V256" stroke="${shade(c, -0.2)}" stroke-width="2"/>`;
  }
}

function shoes(l) {
  const c = l.shoes;
  const edge = c === '#f4f4f4' ? '#cfd4d7' : shade(c, -0.2);
  return `<path d="M64 376 Q64 390 78 392 L98 392 Q100 380 95 374 L76 374 Q66 374 64 376Z" fill="${c}" stroke="${edge}" stroke-width="1.5"/>`
    + `<path d="M136 376 Q136 390 122 392 L102 392 Q100 380 105 374 L124 374 Q134 374 136 376Z" fill="${c}" stroke="${edge}" stroke-width="1.5"/>`;
}

const BUILD = { slim: 0.8, regular: 1, broad: 1.24 };
export const VIEW_FULL = '0 0 200 400';
export const VIEW_HEAD = '44 -8 112 128';

export function avatarSvg(input = {}, { viewBox = VIEW_FULL, cls = 'avatar-svg' } = {}) {
  const l = normalizeLook(input);
  const bx = BUILD[l.build] || 1;
  const widen = (inner) => `<g transform="translate(100 0) scale(${bx} 1) translate(-100 0)">${inner}</g>`;
  return `
<svg class="${cls}" viewBox="${viewBox}" aria-hidden="true">
  <defs>
    <radialGradient id="av-skin" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>
    <linearGradient id="av-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
    <linearGradient id="av-cyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".32" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
    <radialGradient id="av-shadow"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="100" cy="394" rx="${58 * bx}" ry="8" fill="url(#av-shadow)"/>
  <g class="av-body">
    ${widen(legs(l))}
    ${shoes(l)}
    ${widen(torso(l) + arms(l))}
    <rect x="92" y="100" width="16" height="22" rx="5" fill="${l.skin}"/>
    <g transform="translate(100 116) scale(.7) translate(-100 -166)"><g class="av-head">
      ${hairBack(l)}
      <ellipse cx="46" cy="104" rx="9" ry="13" fill="${l.skin}"/>
      <ellipse cx="154" cy="104" rx="9" ry="13" fill="${l.skin}"/>
      <ellipse cx="100" cy="100" rx="54" ry="64" fill="${l.skin}"/>
      <ellipse cx="100" cy="100" rx="54" ry="64" fill="url(#av-skin)"/>
      ${facialHair(l)}
      ${hairFront(l)}
      <g class="av-eyes">${eyes(l)}</g>
      ${brows(l)}
      <path d="M97 112 Q100 122 104 112" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="2.5" stroke-linecap="round"/>
      ${l.facialHair === 'beard' ? '' : mouth(l)}
      <ellipse cx="68" cy="124" rx="8" ry="5" fill="#f08a8a" fill-opacity=".3"/>
      <ellipse cx="132" cy="124" rx="8" ry="5" fill="#f08a8a" fill-opacity=".3"/>
      ${glasses(l)}
      ${hat(l)}
    </g></g>
  </g>
</svg>`;
}
