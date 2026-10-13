// Helpers shared by the dashboard styles.

export function itemTitle(t) {
  return t.caption || t.label || t.title || '';
}

export function itemSub(ctx, t) {
  if (t.type === 'game' && t.game && t.game.kind !== 'jf' && !t.sub) return ctx.gameSub(t.game);
  return t.sub || t.value || '';
}

// The picture for any tile: game or video art, a stream's box art, a
// friend's picture, the user's avatar, or the tile's icon.
export function itemArt(ctx, t, kinds = ['header', 'portrait'], opts = {}) {
  const { el, esc, icon } = ctx;
  if (t.type === 'game' && t.game) return ctx.artEl(t.game, t.game.kind === 'jf' ? ['header', 'portrait'] : kinds, opts);
  if (t.type === 'stream' && t.game) {
    const box = t.game.boxart ? ctx.artEl(t.game, ['boxart'], opts) : el('div', 'art art-icon', icon(t.icon || 'stream'));
    return box;
  }
  if (t.type === 'friend') {
    return el('div', 'art art-pic', t.friend.avatar ? `<img alt="" src="${esc(t.friend.avatar)}">` : icon('user'));
  }
  if (t.type === 'avatar') return el('div', 'art art-pic', ctx.avatarPic(ctx.look(), 'head', 160));
  if (t.type === 'profile') {
    const box = el('div', 'art art-pic');
    ctx.fillGamerpic(box, ctx.state.lib.user);
    return box;
  }
  return el('div', 'art art-icon', icon(t.icon || 'grid'));
}

export function clockText(withDate = false) {
  const d = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!withDate) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'numeric' })}  ${time}`;
}

// Keeps a clock element up to date until the view is destroyed.
export function runClock(node, withDate = false) {
  const tick = () => { node.textContent = clockText(withDate); };
  tick();
  const id = setInterval(tick, 15000);
  return () => clearInterval(id);
}

// requestAnimationFrame loop that pauses while the window is hidden.
export function animate(draw) {
  let on = true;
  let last = 0;
  const frame = (t) => {
    if (!on) return;
    if (!document.hidden && t - last > 30) { last = t; draw(t / 1000); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => { on = false; };
}

// '#rrggbb' scaled towards black (f < 1) or white (f > 1).
export function shade(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0x5a6c7a;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1)));
  return `rgb(${ch.join(',')})`;
}

// True for colors dark enough to need light text on top.
export function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 140;
}
