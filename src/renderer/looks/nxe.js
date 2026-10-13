// 360 NXE (2008): channels stacked vertically, the focused channel's
// cards in a 3D flow (focused card big, the next ones turned away into
// the distance), and your avatar standing on the left. Up/down change
// channel, left/right flip cards.
import { itemTitle, itemSub, itemArt } from './common.js';

export default function createNxe(ctx, root) {
  const { el, esc, state, sound } = ctx;
  const focus = {};
  let rows = [];
  let cur = 0;
  let view = null;

  root.innerHTML = '';
  const box = el('div', 'nxe');
  const stage = el('div', 'nxe-stage');
  const titles = el('div', 'nxe-titles');
  const info = el('div', 'nxe-info');
  const av = el('div', 'nxe-avatar');
  box.append(av, titles, stage, info);
  root.append(box);
  if (ctx.GL) {
    const c = document.createElement('canvas');
    av.append(c);
    view = new ctx.AvatarView(c);
    view.setLook(ctx.look());
    view.start();
  } else {
    av.innerHTML = ctx.avatarPic(ctx.look(), 'full', 320, 'nxe-av-img');
  }

  function sections() {
    const secs = ctx.catalog();
    const spot = { key: 'spotlight', title: 'spotlight', icon: 'sparkle', items: ctx.recentItems(10) };
    return [spot, ...secs];
  }

  function render() {
    const keep = rows[cur] && rows[cur].key;
    rows = sections();
    const k = rows.findIndex((r) => r.key === keep);
    cur = k >= 0 ? k : 0;
    titles.innerHTML = '';
    stage.innerHTML = '';
    rows.forEach((r, ri) => {
      const t = el('div', 'nxe-title', esc(r.title));
      t.addEventListener('click', () => { if (ri !== cur) { cur = ri; sound.play('channel'); layout(); } });
      titles.append(t);
      const row = el('div', 'nxe-row');
      r.items.forEach((it, ii) => {
        const card = el('div', 'nxe-card');
        card.append(itemArt(ctx, it, ['header', 'portrait']));
        card.append(el('div', 'nxe-cap', esc(itemTitle(it))));
        card.addEventListener('click', () => {
          if (ri === cur && idx(r) === ii) { ctx.activate(); return; }
          cur = ri; focus[r.key] = ii; sound.play('move'); layout();
        });
        row.append(card);
      });
      if (!r.items.length) row.append(el('div', 'nxe-empty', 'nothing here yet'));
      stage.append(row);
    });
    if (view) view.setLook(ctx.look());
    layout();
  }

  function idx(r) {
    return Math.max(0, Math.min(r.items.length - 1, focus[r.key] || 0));
  }

  function layout() {
    const W = innerWidth;
    const H = innerHeight;
    const ch = H * 0.36 * ctx.scale();
    const cw = ch * 1.33;
    const x0 = W * 0.36;
    const y0 = H * 0.24;
    const rowGap = H * 0.62;
    box.style.setProperty('--cw', cw + 'px');
    box.style.setProperty('--ch', ch + 'px');
    [...titles.children].forEach((t, i) => {
      const d = i - cur;
      t.classList.toggle('on', d === 0);
      // Current title over the cards, the next channels listed below them.
      const y = d === 0 ? y0 - H * 0.075 : d > 0 ? y0 + ch + H * 0.1 + (d - 1) * H * 0.055 : y0 - H * 0.075 + d * H * 0.06;
      t.style.transform = `translate(${x0 - cw / 2}px, ${y}px)`;
      t.style.opacity = d === 0 ? 1 : d > 0 ? (d > 3 ? 0 : 0.75 - (d - 1) * 0.18) : d === -1 ? 0.35 : 0;
    });
    [...stage.children].forEach((row, ri) => {
      const d = ri - cur;
      row.style.transform = `translateY(${d * rowGap}px)`;
      row.style.opacity = d === 0 ? 1 : 0;
      row.classList.toggle('on', d === 0);
      const r = rows[ri];
      const f = idx(r);
      [...row.children].forEach((card, i) => {
        const k = i - f;
        let x;
        let rot = 0;
        let z = 0;
        let o = 1;
        if (k === 0) x = x0 - cw / 2;
        else if (k > 0) { x = x0 + cw * 0.62 + (k - 1) * cw * 0.34; rot = -38; z = -120 - k * 60; o = k > 6 ? 0 : 1; }
        else { x = x0 - cw / 2 - cw * 0.9 + (k + 1) * cw * 0.3; rot = 38; z = -200; o = 0; }
        // Each card has its own perspective, so nearer cards stack on top.
        card.style.transform = `translate(${x}px, ${y0}px) perspective(1400px) translateZ(${z}px) rotateY(${rot}deg)`;
        card.style.opacity = o;
        card.style.filter = k > 0 ? `brightness(${Math.max(0.35, 0.92 - k * 0.1)})` : '';
        card.style.zIndex = 100 - Math.abs(k);
        card.classList.toggle('on', ri === cur && k === 0);
      });
    });
    const t = current();
    info.innerHTML = t ? `<b>${esc(itemTitle(t))}</b><span>${esc(itemSub(ctx, t))}</span>` : '';
    info.style.transform = `translate(${x0 - cw / 2}px, ${y0 + ch + H * 0.02}px)`;
    av.style.width = W * 0.17 + 'px';
    av.style.height = H * 0.62 + 'px';
    av.style.left = W * 0.03 + 'px';
    av.style.top = H * 0.2 + 'px';
    if (view) { if (state.overlays.length) view.stop(); else view.start(); }
    ctx.hints();
  }

  function current() {
    const r = rows[cur];
    return r && r.items[idx(r)];
  }

  function step(d) {
    const r = rows[cur];
    if (!r || !r.items.length) return;
    const n = Math.max(0, Math.min(r.items.length - 1, idx(r) + d));
    if (n === idx(r)) return;
    focus[r.key] = n;
    sound.play('move');
    layout();
  }

  function channel(d) {
    const n = cur + d;
    if (n < 0 || n >= rows.length) return;
    cur = n;
    sound.play('channel');
    if (view && Math.random() < 0.3) view.wave();
    layout();
  }

  return {
    id: 'nxe',
    render,
    layout,
    current,
    handle(a) {
      if (a === 'left') step(-1);
      else if (a === 'right') step(1);
      else if (a === 'up' || a === 'lb') channel(-1);
      else if (a === 'down' || a === 'rb') channel(1);
      else return false;
      return true;
    },
    home() {
      const r = rows[cur];
      if (cur === 0 && r && idx(r) === 0) return false;
      if (r && idx(r) !== 0) focus[r.key] = 0; else cur = 0;
      layout();
      return true;
    },
    goto(key) {
      const i = rows.findIndex((r) => r.key === key);
      if (i >= 0) { cur = i; focus[key] = 0; layout(); }
    },
    hints: () => [['lb', 'channel']],
    destroy() { if (view) { view.stop(); view.renderer.dispose(); } root.innerHTML = ''; },
  };
}
