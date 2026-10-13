// Retro plus: an original take on mid-2000s console menus (glossy chrome
// capsules, drifting orbs, a big framed picture with a mirror reflection,
// a menu list down the left) with the shortcuts of newer dashboards: a
// "jump back in" dock that is always one press away, a shelf of artwork
// with a position counter, the gamercard and clock always on screen, and
// LB/RB changing section from anywhere.
// Zones: menu (left list), shelf (the section's items), dock (recent).
import { itemTitle, itemSub, itemArt, runClock } from './common.js';

const COLORS = {
  search: '#7d58c6', games: '#5aa51e', apps: '#1f9a9a', video: '#2b6fd0', streaming: '#4b3fa0',
  social: '#f08a00', steam: '#d04a1a', settings: '#7c868d',
};

export default function createRetro(ctx, root) {
  const { el, esc, icon, state, sound } = ctx;
  const focus = {};
  let secs = [];
  let dockItems = [];
  let cur = 0;
  let zone = 'shelf'; // 'menu' | 'shelf' | 'dock'
  let dockAt = 0;

  root.innerHTML = '';
  const box = el('div', 'retro');
  const orbs = el('div', 'retro-orbs');
  for (let i = 0; i < 9; i++) {
    const o = el('i');
    o.style.setProperty('--x', `${(i * 37) % 100}%`);
    o.style.setProperty('--s', `${8 + ((i * 13) % 22)}vh`);
    o.style.setProperty('--d', `${18 + ((i * 7) % 14)}s`);
    o.style.setProperty('--delay', `${-i * 3.1}s`);
    orbs.append(o);
  }
  const card = el('div', 'retro-card', '<div class="retro-pic"></div><div class="retro-who"><b></b><span></span></div>');
  const clock = el('div', 'retro-clock');
  const menu = el('div', 'retro-menu');
  const stage = el('div', 'retro-stage');
  const frame = el('div', 'retro-frame');
  const info = el('div', 'retro-info');
  stage.append(frame, info);
  const shelfHead = el('div', 'retro-shelf-head');
  const shelf = el('div', 'retro-shelf');
  const dock = el('div', 'retro-dock');
  const dockHead = el('div', 'retro-dock-head', 'jump back in');
  box.append(orbs, card, clock, menu, stage, shelfHead, shelf, dockHead, dock);
  root.append(box);
  const stopClock = runClock(clock, true);

  function render() {
    const keep = secs[cur] && secs[cur].key;
    secs = ctx.catalog();
    dockItems = ctx.recentItems(12).slice(0, 12);
    const k = secs.findIndex((s) => s.key === (keep || 'games'));
    cur = k >= 0 ? k : 0;
    dockAt = Math.min(dockAt, Math.max(0, dockItems.length - 1));
    if (!dockItems.length && zone === 'dock') zone = 'shelf';

    ctx.fillGamerpic(card.querySelector('.retro-pic'), state.lib.user);
    card.querySelector('b').textContent = ctx.displayName();
    card.querySelector('span').textContent = ctx.gamesLine();
    card.onclick = () => ctx.activateUser();

    menu.innerHTML = '';
    secs.forEach((s, si) => {
      const m = el('div', 'retro-tab', `${icon(s.icon)}<span>${esc(s.title)}</span>`);
      m.style.setProperty('--c', ctx.accent() || COLORS[s.key] || '#5aa51e');
      m.addEventListener('click', () => { cur = si; zone = 'shelf'; sound.play('channel'); fill(); });
      menu.append(m);
    });

    dock.innerHTML = '';
    dockItems.forEach((t, i) => {
      const d = el('div', 'retro-dock-item');
      d.append(itemArt(ctx, t, ['portrait', 'header'], { portrait: true }));
      d.title = itemTitle(t);
      d.addEventListener('click', () => {
        if (zone === 'dock' && dockAt === i) { ctx.activate(); return; }
        zone = 'dock'; dockAt = i; sound.play('move'); layout();
      });
      dock.append(d);
    });
    dockHead.hidden = dock.hidden = !dockItems.length;
    fill();
  }

  // Rebuilds the shelf for the current section.
  function fill() {
    shelf.innerHTML = '';
    const s = secs[cur];
    box.style.setProperty('--c', ctx.accent() || (s && COLORS[s.key]) || '#5aa51e');
    (s ? s.items : []).forEach((t, i) => {
      const c = el('div', 'retro-item');
      c.append(itemArt(ctx, t, ['header', 'portrait'], { lazy: true }));
      c.append(el('div', 'retro-cap', esc(itemTitle(t))));
      c.addEventListener('click', () => {
        if (zone === 'shelf' && idx(s) === i) { ctx.activate(); return; }
        focus[s.key] = i; zone = 'shelf'; sound.play('move'); layout();
      });
      shelf.append(c);
    });
    if (s && !s.items.length) shelf.append(el('div', 'retro-empty', 'nothing here yet'));
    frame.dataset.key = '';
    layout();
  }

  function idx(s) {
    return Math.max(0, Math.min(s.items.length - 1, focus[s.key] || 0));
  }

  function layout() {
    const s = secs[cur];
    const f = s ? idx(s) : 0;
    box.dataset.zone = zone;
    [...menu.children].forEach((m, i) => {
      m.classList.toggle('on', i === cur);
      m.classList.toggle('focus', zone === 'menu' && i === cur);
    });

    // Shelf: the focused card stays near the left third, so the ones
    // coming up are always visible (the newer convenience).
    const H = innerHeight;
    const cw = H * 0.2 * ctx.scale();
    const gap = H * 0.022;
    const lead = Math.min(f, 1);
    [...shelf.children].forEach((c, i) => {
      if (!c.classList.contains('retro-item')) return;
      const k = i - f;
      c.style.transform = `translateX(${(k + lead) * (cw + gap)}px)`;
      c.style.opacity = k < -lead ? 0 : 1;
      c.classList.toggle('on', k === 0);
      c.classList.toggle('focus', k === 0 && zone === 'shelf');
    });
    box.style.setProperty('--cw', cw + 'px');
    shelfHead.innerHTML = s ? `<b>${esc(s.title)}</b>${s.items.length ? `<span>${f + 1} / ${s.items.length}</span>` : ''}` : '';

    [...dock.children].forEach((d, i) => d.classList.toggle('focus', zone === 'dock' && i === dockAt));

    const t = current();
    const key = t ? t.key + ':' + zone : '';
    if (frame.dataset.key !== key) {
      frame.dataset.key = key;
      const pic = el('div', 'retro-shot');
      if (t) pic.append(itemArt(ctx, t, t.game && t.game.kind === 'jf' ? ['header', 'portrait'] : ['hero', 'header', 'portrait']));
      frame.append(pic);
      requestAnimationFrame(() => pic.classList.add('in'));
      while (frame.children.length > 2) frame.firstChild.remove();
      if (t) {
        const where = zone === 'dock' ? 'jump back in' : s ? s.title : '';
        const verb = t.type === 'game' || t.type === 'stream' ? 'play' : 'open';
        info.innerHTML = `<small>${esc(where)}</small><h1>${esc(itemTitle(t))}</h1><p>${esc(itemSub(ctx, t))}</p>`
          + `<div class="retro-btns"><button class="retro-go"><i>A</i>${verb === 'play' ? 'details' : 'open'}</button>`
          + `${verb === 'play' ? '<button class="retro-play"><i>X</i>play now</button>' : ''}</div>`;
        info.querySelector('.retro-go').addEventListener('click', () => ctx.activate());
        const play = info.querySelector('.retro-play');
        if (play) play.addEventListener('click', () => ctx.play(current()));
      } else info.innerHTML = '<h1>nothing here yet</h1>';
    }
    ctx.hints();
  }

  function current() {
    if (zone === 'dock') return dockItems[dockAt];
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
    if (zone === 'dock') zone = 'shelf';
    sound.play('channel');
    fill();
  }

  function go(z) {
    zone = z;
    sound.play('move');
    layout();
  }

  return {
    id: 'retro',
    render,
    layout,
    current,
    handle(a) {
      if (a === 'lb' || a === 'rb') { section(a === 'lb' ? -1 : 1); return true; }
      if (zone === 'menu') {
        if (a === 'up' || a === 'down') section(a === 'up' ? -1 : 1);
        else if (a === 'right' || a === 'a') go('shelf');
        else return a === 'left';
        return true;
      }
      if (zone === 'dock') {
        if (a === 'left' && dockAt === 0) go('menu');
        else if (a === 'left' || a === 'right') {
          const n = Math.max(0, Math.min(dockItems.length - 1, dockAt + (a === 'left' ? -1 : 1)));
          if (n !== dockAt) { dockAt = n; sound.play('move'); layout(); }
        } else if (a === 'up') go('shelf');
        else return a === 'down';
        return true;
      }
      const s = secs[cur];
      if (a === 'left' && (!s || idx(s) === 0)) go('menu');
      else if (a === 'left') step(-1);
      else if (a === 'right') step(1);
      else if (a === 'lt') step(-6);
      else if (a === 'rt') step(6);
      else if (a === 'down') { if (dockItems.length) go('dock'); }
      else if (a === 'up') go('menu');
      else return false;
      return true;
    },
    home() {
      const gi = Math.max(0, secs.findIndex((s) => s.key === 'games'));
      const s = secs[cur];
      if (zone === 'shelf' && cur === gi && s && idx(s) === 0) return false;
      if (zone !== 'shelf') zone = 'shelf';
      else if (s && idx(s) !== 0) focus[s.key] = 0;
      else { cur = gi; fill(); return true; }
      layout();
      return true;
    },
    goto(key) {
      const i = secs.findIndex((s) => s.key === key);
      if (i >= 0) { cur = i; focus[key] = 0; zone = 'shelf'; fill(); }
    },
    hints: () => [['lb', 'section']],
    destroy() { stopClock(); root.innerHTML = ''; },
  };
}
