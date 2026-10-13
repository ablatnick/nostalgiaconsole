// 360 Blades (2005): each section is a coloured blade. The open blade
// fills the screen with a menu on the left and a preview of the focused
// item on the right; passed blades stack at the left edge, the rest at
// the right. LB/RB or left/right change blade, up/down move in the menu.
import { itemTitle, itemSub, itemArt } from './common.js';

const COLORS = {
  search: '#7d58c6', games: '#5aa51e', apps: '#1f9a9a', video: '#2b6fd0', streaming: '#4b3fa0',
  social: '#f08a00', steam: '#d04a1a', settings: '#7c868d',
};

export default function createBlades(ctx, root) {
  const { el, esc, sound } = ctx;
  const focus = {};
  let secs = [];
  let cur = 0;

  root.innerHTML = '';
  const box = el('div', 'blades');
  root.append(box);

  function render() {
    const keep = secs[cur] && secs[cur].key;
    secs = ctx.catalog();
    const k = secs.findIndex((s) => s.key === (keep || 'games'));
    cur = k >= 0 ? k : 0;
    box.innerHTML = '';
    secs.forEach((s, si) => {
      const b = el('div', 'blade');
      b.style.setProperty('--blade', COLORS[s.key] || '#5aa51e');
      b.append(el('div', 'blade-tab', esc(s.title)));
      const body = el('div', 'blade-body');
      body.append(el('h2', 'blade-title', esc(s.title)));
      const menu = el('div', 'blade-menu');
      s.items.forEach((t, ii) => {
        const m = el('div', 'blade-item', esc(itemTitle(t)));
        m.addEventListener('click', (e) => {
          e.stopPropagation();
          if (si === cur && idx(s) === ii) { ctx.activate(); return; }
          cur = si; focus[s.key] = ii; sound.play('move'); layout();
        });
        menu.append(m);
      });
      if (!s.items.length) menu.append(el('div', 'blade-item empty', 'nothing here yet'));
      body.append(menu, el('div', 'blade-preview'));
      b.append(body);
      b.addEventListener('click', () => { if (si !== cur) { cur = si; sound.play('channel'); layout(); } });
      box.append(b);
    });
    layout();
  }

  function idx(s) {
    return Math.max(0, Math.min(s.items.length - 1, focus[s.key] || 0));
  }

  function layout() {
    const W = innerWidth;
    const n = secs.length;
    const tab = Math.max(34, W * 0.034);
    const open = W - (n - 1) * tab - W * 0.04;
    [...box.children].forEach((b, si) => {
      const on = si === cur;
      const x = si <= cur ? W * 0.02 + si * tab : W * 0.02 + (si - 1) * tab + open;
      b.style.transform = `translateX(${x}px)`;
      b.style.width = (on ? open : tab) + 'px';
      b.style.zIndex = on ? 50 : 40 - Math.abs(si - cur);
      b.classList.toggle('on', on);
      const s = secs[si];
      const f = idx(s);
      const items = b.querySelectorAll('.blade-item');
      items.forEach((m, i) => m.classList.toggle('sel', on && i === f));
      const menu = b.querySelector('.blade-menu');
      if (on && items[f]) {
        // Keep the selection in view.
        const top = items[f].offsetTop - menu.clientHeight / 2 + items[f].offsetHeight / 2;
        menu.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      const pv = b.querySelector('.blade-preview');
      if (on) {
        const t = s.items[f];
        const key = t ? t.key : '';
        if (pv.dataset.key !== key) {
          pv.dataset.key = key;
          pv.innerHTML = '';
          if (t) {
            const pic = el('div', 'blade-pic');
            pic.append(itemArt(ctx, t, ['header', 'portrait']));
            pv.append(pic, el('div', 'blade-desc', `<b>${esc(itemTitle(t))}</b><span>${esc(itemSub(ctx, t))}</span>`));
          }
        }
      }
    });
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

  function blade(d) {
    const n = cur + d;
    if (n < 0 || n >= secs.length) return;
    cur = n;
    sound.play('channel');
    layout();
  }

  return {
    id: 'blades',
    render,
    layout,
    current,
    handle(a) {
      if (a === 'up') step(-1);
      else if (a === 'down') step(1);
      else if (a === 'left' || a === 'lb') blade(-1);
      else if (a === 'right' || a === 'rb') blade(1);
      else if (a === 'lt') step(-6);
      else if (a === 'rt') step(6);
      else return false;
      return true;
    },
    home() {
      const gi = Math.max(0, secs.findIndex((s) => s.key === 'games'));
      const s = secs[cur];
      if (cur === gi && s && idx(s) === 0) return false;
      if (s && idx(s) !== 0) focus[s.key] = 0; else cur = gi;
      layout();
      return true;
    },
    goto(key) {
      const i = secs.findIndex((s) => s.key === key);
      if (i >= 0) { cur = i; focus[key] = 0; layout(); }
    },
    hints: () => [['lb', 'blade']],
    destroy() { root.innerHTML = ''; },
  };
}
