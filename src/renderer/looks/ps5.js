// Modern cards: section tabs along the top, a row of square icons, and
// the focused game's artwork filling the screen with its logo and a Play
// button. Left/right move in the row, LB/RB or up change section, down
// goes to the buttons.
import { itemTitle, itemSub, itemArt, runClock } from './common.js';

export default function createPs5(ctx, root) {
  const { el, esc, icon, state, sound } = ctx;
  const focus = {};
  let secs = [];
  let cur = 0;
  let zone = 'row'; // 'tabs' | 'row' | 'actions'
  let act = 0;      // 0 play / open, 1 details

  root.innerHTML = '';
  const box = el('div', 'ps5');
  const hero = el('div', 'ps5-hero');
  const tabs = el('div', 'ps5-tabs');
  const right = el('div', 'ps5-right', '<span class="ps5-clock"></span>');
  const row = el('div', 'ps5-row');
  const name = el('div', 'ps5-name');
  const detail = el('div', 'ps5-detail');
  box.append(hero, tabs, right, row, name, detail);
  root.append(box);
  const pic = el('div', 'ps5-me');
  right.prepend(pic);
  const stopClock = runClock(right.querySelector('.ps5-clock'));

  function sections() {
    const list = ctx.catalog();
    const home = { key: 'home', title: 'home', icon: 'controller', items: ctx.recentItems(14) };
    return [home, ...list.filter((s) => s.key !== 'search')];
  }

  function render() {
    const keep = secs[cur] && secs[cur].key;
    secs = sections();
    const k = secs.findIndex((s) => s.key === keep);
    cur = k >= 0 ? k : 0;
    ctx.fillGamerpic(pic, state.lib.user);
    tabs.innerHTML = '';
    secs.forEach((s, si) => {
      const t = el('div', 'ps5-tab', esc(s.title));
      t.addEventListener('click', () => { cur = si; zone = 'row'; sound.play('channel'); fill(); });
      tabs.append(t);
    });
    fill();
  }

  // Rebuilds the icon row for the current section.
  function fill() {
    row.innerHTML = '';
    const s = secs[cur];
    (s ? s.items : []).forEach((t, i) => {
      const c = el('div', 'ps5-icon');
      c.append(itemArt(ctx, t, ['header', 'portrait']));
      c.addEventListener('click', () => {
        if (zone === 'row' && idx(s) === i) { ctx.activate(); return; }
        focus[s.key] = i; zone = 'row'; sound.play('move'); layout();
      });
      row.append(c);
    });
    if (s && !s.items.length) row.append(el('div', 'ps5-empty', 'nothing here yet'));
    hero.dataset.key = '';
    layout();
  }

  function idx(s) {
    return Math.max(0, Math.min(s.items.length - 1, focus[s.key] || 0));
  }

  function layout() {
    const H = innerHeight;
    const W = innerWidth;
    const s = secs[cur];
    const f = s ? idx(s) : 0;
    [...tabs.children].forEach((t, i) => { t.classList.toggle('on', i === cur); t.classList.toggle('focus', zone === 'tabs' && i === cur); });
    const size = H * 0.11;
    const big = H * 0.15;
    const gap = H * 0.018;
    const x0 = W * 0.06;
    [...row.children].forEach((c, i) => {
      const on = i === f;
      // Icons before the focused one scroll off to the left.
      const x = x0 + (i - f) * (size + gap) + (i > f ? big - size + gap * 0.5 : 0);
      c.style.transform = `translate(${x}px, 0)`;
      c.style.width = c.style.height = (on ? big : size) + 'px';
      c.style.opacity = i < f - 1 ? 0 : 1;
      c.classList.toggle('on', on);
      c.classList.toggle('focus', on && zone === 'row');
    });
    const t = current();
    name.style.left = x0 + 'px';
    name.style.top = H * 0.13 + big + gap + 'px';
    name.innerHTML = t ? `<b>${esc(itemTitle(t))}</b>` : '';
    if (t && hero.dataset.key !== t.key) {
      hero.dataset.key = t.key;
      const next = el('div', 'ps5-bg');
      if (t.game) next.append(ctx.artEl(t.game, t.game.kind === 'jf' ? ['hero', 'header'] : ['hero', 'header', 'portrait']));
      else next.classList.add('plain');
      hero.append(next);
      requestAnimationFrame(() => next.classList.add('in'));
      while (hero.children.length > 2) hero.firstChild.remove();
      detail.innerHTML = '';
      const logo = el('div', 'ps5-logo');
      if (t.game && t.game.kind === 'steam') {
        const img = new Image();
        img.alt = '';
        img.src = ctx.artUrl(t.game, 'logo');
        img.onerror = () => { logo.innerHTML = `<h1>${esc(itemTitle(t))}</h1>`; };
        logo.append(img);
      } else if (t.game) logo.innerHTML = `<h1>${esc(itemTitle(t))}</h1>`;
      else logo.innerHTML = `<div class="ps5-bigico">${icon(t.icon || 'grid')}</div><h1>${esc(itemTitle(t))}</h1>`;
      const play = t.type === 'game' || t.type === 'stream' ? 'play' : 'open';
      detail.append(logo,
        el('div', 'ps5-actions', `<button class="ps5-play">${play}</button>${t.type === 'game' ? '<button class="ps5-more">···</button>' : ''}`),
        el('div', 'ps5-sub', esc(itemSub(ctx, t))));
      detail.querySelector('.ps5-play').addEventListener('click', () => ctx.play(current()));
      const more = detail.querySelector('.ps5-more');
      if (more) more.addEventListener('click', () => { act = 1; zone = 'actions'; layout(); });
    }
    const btns = detail.querySelectorAll('.ps5-actions button');
    btns.forEach((b, i) => b.classList.toggle('focus', zone === 'actions' && i === act));
    ctx.hints();
  }

  function current() {
    const s = secs[cur];
    return s && s.items[idx(s)];
  }

  function step(d) {
    const s = secs[cur];
    if (!s || !s.items.length) return;
    const n = Math.max(0, Math.min(s.items.length - 1, idx(s) + d));
    if (n === idx(s)) return;
    focus[s.key] = n;
    sound.play('move');
    layout();
  }

  function section(d) {
    const n = cur + d;
    if (n < 0 || n >= secs.length) return;
    cur = n;
    sound.play('channel');
    fill();
  }

  return {
    id: 'ps5',
    render,
    layout,
    current,
    handle(a) {
      if (a === 'lb' || a === 'rb') { section(a === 'lb' ? -1 : 1); return true; }
      if (zone === 'tabs') {
        if (a === 'left' || a === 'right') { section(a === 'left' ? -1 : 1); return true; }
        if (a === 'down' || a === 'a') { zone = 'row'; sound.play('move'); layout(); return true; }
        return a === 'up';
      }
      if (zone === 'actions') {
        const n = detail.querySelectorAll('.ps5-actions button').length;
        if (a === 'left' || a === 'right') { act = Math.max(0, Math.min(n - 1, act + (a === 'left' ? -1 : 1))); sound.play('move'); layout(); return true; }
        if (a === 'up') { zone = 'row'; sound.play('move'); layout(); return true; }
        if (a === 'a') {
          if (act === 0) { sound.play('select'); ctx.play(current()); return true; }
          return false; // details, from app.js
        }
        return a === 'down';
      }
      if (a === 'left') step(-1);
      else if (a === 'right') step(1);
      else if (a === 'up') { zone = 'tabs'; sound.play('move'); layout(); }
      else if (a === 'down') { zone = 'actions'; act = 0; sound.play('move'); layout(); }
      else return false;
      return true;
    },
    home() {
      zone = 'row';
      const s = secs[cur];
      if (cur === 0 && s && idx(s) === 0) { layout(); return false; }
      if (s && idx(s) !== 0) { focus[s.key] = 0; layout(); } else { cur = 0; fill(); }
      return true;
    },
    goto(key) {
      const i = secs.findIndex((s) => s.key === key);
      if (i >= 0) { cur = i; focus[key] = 0; zone = 'row'; fill(); }
    },
    hints: () => [['lb', 'section']],
    destroy() { stopClock(); root.innerHTML = ''; },
  };
}
