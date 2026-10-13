// Tile strip: your profile pictures top left, the clock top right, a row
// of big square game tiles (the focused one outlined, its name above it),
// a row of round shortcut buttons below, and a thin footer. Light or dark
// to match the theme. Left/right move, down goes to the round buttons,
// up from the tiles goes to your profile.
import { itemTitle, itemArt, runClock } from './common.js';

export default function createSwitch(ctx, root) {
  const { el, esc, icon, state, sound } = ctx;
  let tiles = [];
  let buttons = [];
  let i = 0;
  let b = 0;
  let zone = 'tiles'; // 'user' | 'tiles' | 'buttons'

  root.innerHTML = '';
  const box = el('div', 'tstrip');
  const top = el('div', 'ts-top', '<div class="ts-users"></div><div class="ts-clock"></div>');
  const strip = el('div', 'ts-strip');
  const label = el('div', 'ts-label');
  const round = el('div', 'ts-round');
  const foot = el('div', 'ts-foot', `${icon('controller')}`);
  box.append(top, label, strip, round, foot);
  root.append(box);
  const stopClock = runClock(top.querySelector('.ts-clock'));

  function shortcuts() {
    const secs = ctx.catalog();
    const has = (k) => secs.some((s) => s.key === k);
    const go = (k) => () => openSection(k);
    const list = [];
    if (has('social')) list.push({ key: 'b:social', icon: 'friends', label: 'friends', run: go('social') });
    if (has('steam')) list.push({ key: 'b:steam', icon: 'store', label: 'steam', run: go('steam') });
    list.push({ key: 'b:library', icon: 'grid', label: 'all games', run: () => ctx.openLibrary() });
    if (has('video')) list.push({ key: 'b:video', icon: 'bigpicture', label: 'video', run: go('video') });
    if (has('streaming')) list.push({ key: 'b:streaming', icon: 'stream', label: 'streaming', run: go('streaming') });
    if (has('apps')) list.push({ key: 'b:apps', icon: 'library', label: 'apps', run: go('apps') });
    if (has('settings')) list.push({ key: 'b:settings', icon: 'gear', label: 'settings', run: go('settings') });
    return list;
  }

  // A round button opens that section's items in the tile row; B goes back
  // to the games.
  let section = null;
  function openSection(k) {
    const s = ctx.catalog().find((x) => x.key === k);
    if (!s) return;
    section = { key: k, title: s.title };
    zone = 'tiles';
    i = 0;
    sound.play('open');
    render();
  }

  function render() {
    const keep = tiles[i] && tiles[i].key;
    const theme = state.settings.theme;
    box.classList.toggle('dark', theme === 'midnight' || theme === 'ember' || state.settings.bgColor === 'black' || state.settings.bgColor === 'graphite');
    if (section) {
      const s = ctx.catalog().find((x) => x.key === section.key);
      tiles = s ? s.items : [];
    } else {
      tiles = ctx.recentItems(12).concat([{ key: 'ts:all', type: 'icon', icon: 'grid', label: 'all games', title: 'all games', activate: () => ctx.openLibrary() }]);
    }
    const k = tiles.findIndex((t) => t.key === keep);
    if (k >= 0) i = k; else i = Math.min(i, Math.max(0, tiles.length - 1));
    buttons = shortcuts();
    const users = top.querySelector('.ts-users');
    users.innerHTML = '';
    const me = el('div', 'ts-user');
    ctx.fillGamerpic(me, state.lib.user);
    me.addEventListener('click', () => { zone = 'user'; layout(); ctx.activateUser(); });
    users.append(me);
    strip.innerHTML = '';
    tiles.forEach((t, k2) => {
      const c = el('div', 'ts-tile');
      if (t.type === 'icon' || t.type === 'friend' || t.type === 'avatar' || t.type === 'profile') {
        const face = el('div', 'art art-icon ts-face');
        face.append(itemArt(ctx, t));
        face.append(el('b', '', esc(itemTitle(t))));
        c.append(face);
      } else c.append(itemArt(ctx, t, ['header', 'portrait']));
      c.addEventListener('click', () => { if (zone === 'tiles' && k2 === i) ctx.activate(); else { zone = 'tiles'; i = k2; sound.play('move'); layout(); } });
      strip.append(c);
    });
    if (!tiles.length) strip.append(el('div', 'ts-empty', 'nothing here yet'));
    round.innerHTML = '';
    buttons.forEach((btn, k2) => {
      const r = el('button', 'ts-btn', `${icon(btn.icon)}<span>${esc(btn.label)}</span>`);
      r.addEventListener('click', () => { zone = 'buttons'; b = k2; layout(); btn.run(); });
      round.append(r);
    });
    layout();
  }

  function layout() {
    const W = innerWidth;
    const H = innerHeight;
    const size = H * 0.42;
    const gap = H * 0.022;
    // Keep the focused tile in view, scrolling a tile at a time.
    const visible = Math.floor((W * 0.9) / (size + gap));
    const first = Math.max(0, Math.min(i - Math.floor(visible / 2), tiles.length - visible));
    const x0 = W * 0.05 - first * (size + gap);
    [...strip.children].forEach((c, k) => {
      c.style.transform = `translate(${x0 + k * (size + gap)}px, 0)`;
      c.style.width = c.style.height = size + 'px';
      c.classList.toggle('on', zone === 'tiles' && k === i);
    });
    strip.style.top = H * 0.24 + 'px';
    const t = tiles[i];
    label.textContent = t ? itemTitle(t) : '';
    label.style.left = Math.max(W * 0.05, x0 + i * (size + gap)) + 'px';
    label.style.top = H * 0.24 - H * 0.055 + 'px';
    label.classList.toggle('show', zone === 'tiles');
    [...round.children].forEach((r, k) => r.classList.toggle('on', zone === 'buttons' && k === b));
    top.querySelector('.ts-user').classList.toggle('on', zone === 'user');
    box.querySelector('.ts-foot').dataset.section = section ? section.title : '';
    ctx.hints();
  }

  function current() {
    if (zone === 'buttons') return { key: buttons[b] && buttons[b].key, type: 'icon', activate: buttons[b] && buttons[b].run };
    if (zone === 'user') return { key: 'ts:user', type: 'icon', activate: () => ctx.activateUser() };
    return tiles[i];
  }

  return {
    id: 'switch',
    render,
    layout,
    current,
    handle(a) {
      if (zone === 'tiles') {
        if (a === 'left' && i > 0) { i--; sound.play('move'); layout(); return true; }
        if (a === 'right' && i < tiles.length - 1) { i++; sound.play('move'); layout(); return true; }
        if (a === 'down') { zone = 'buttons'; b = Math.min(b, buttons.length - 1); sound.play('move'); layout(); return true; }
        if (a === 'up') { zone = 'user'; sound.play('move'); layout(); return true; }
        if (a === 'lb' || a === 'rb') { i = Math.max(0, Math.min(tiles.length - 1, i + (a === 'lb' ? -4 : 4))); sound.play('move'); layout(); return true; }
        return a === 'left' || a === 'right';
      }
      if (zone === 'buttons') {
        if (a === 'left' && b > 0) { b--; sound.play('move'); layout(); }
        else if (a === 'right' && b < buttons.length - 1) { b++; sound.play('move'); layout(); }
        else if (a === 'up') { zone = 'tiles'; sound.play('move'); layout(); }
        else return a === 'left' || a === 'right' || a === 'down';
        return true;
      }
      // user
      if (a === 'down') { zone = 'tiles'; sound.play('move'); layout(); return true; }
      return a === 'up' || a === 'left' || a === 'right';
    },
    home() {
      if (section) { section = null; zone = 'tiles'; i = 0; render(); return true; }
      if (zone !== 'tiles' || i !== 0) { zone = 'tiles'; i = 0; layout(); return true; }
      return false;
    },
    goto(key) { if (key === 'home') { section = null; render(); } else openSection(key); },
    hints: () => (section ? [['b', 'back']] : []),
    destroy() { stopClock(); root.innerHTML = ''; },
  };
}
