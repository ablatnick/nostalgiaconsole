// Cross media bar: a row of category icons with the focused category's
// items in a column through it (items already passed sit above the bar),
// over a slowly flowing wave. Left/right change category, up/down item.
import { itemTitle, itemSub, itemArt, runClock, animate, shade } from './common.js';

// Background colour by month when no background or tile colour is picked.
const MONTHS = ['#5a6c7a', '#b8a33a', '#5f8f2f', '#c47fa8', '#3f8a3a', '#7a5a9a', '#2f8fa8', '#2a5fb0', '#8a4fa8', '#c4782f', '#8a6a3f', '#a83a3a'];

export default function createXmb(ctx, root) {
  const { el, esc, icon, state, sound } = ctx;
  const focus = {}; // section key -> item index
  let sections = [];
  let cat = 0;
  let stopClock = null;
  let stopWave = null;

  root.innerHTML = '';
  const box = el('div', 'xmb');
  const canvas = document.createElement('canvas');
  canvas.className = 'xmb-wave';
  const cats = el('div', 'xmb-cats');
  const items = el('div', 'xmb-items');
  const clock = el('div', 'xmb-clock');
  box.append(canvas, cats, items, clock);
  root.append(box);
  stopClock = runClock(clock, true);

  function baseColor() {
    const bg = ctx.backdrop();
    // Background colours are dark already; lift them so the wave still shows.
    if (bg) return bg[0];
    return ctx.accent() || MONTHS[new Date().getMonth()];
  }

  // The wave: two soft bands and a few fine lines drifting across.
  const g = canvas.getContext('2d');
  function wave(t) {
    const w = canvas.width = Math.round(innerWidth / 2);
    const h = canvas.height = Math.round(innerHeight / 2);
    const c = baseColor();
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, shade(c, 0.45));
    bg.addColorStop(0.55, shade(c, 0.95));
    bg.addColorStop(1, shade(c, 0.4));
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const y = (x, k, off) => h * (0.56 + off) + Math.sin(x / w * 5.2 + t * 0.35 * k) * h * 0.05 + Math.sin(x / w * 2.1 - t * 0.22) * h * 0.06;
    for (const [k, off, a] of [[1, 0, 0.16], [1.4, 0.03, 0.1]]) {
      g.beginPath();
      for (let x = 0; x <= w; x += 6) g.lineTo(x, y(x, k, off));
      for (let x = w; x >= 0; x -= 6) g.lineTo(x, y(x, k, off) + h * 0.07 + Math.sin(x / w * 3 + t * 0.5) * h * 0.02);
      g.closePath();
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fill();
    }
    g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      for (let x = 0; x <= w; x += 6) g.lineTo(x, y(x, 1.1 + i * 0.15, 0.015 * i) + h * 0.03);
      g.strokeStyle = `rgba(255,255,255,${0.22 - i * 0.04})`;
      g.stroke();
    }
  }
  stopWave = animate(wave);

  function render() {
    const keep = sections[cat] && sections[cat].key;
    sections = ctx.catalog();
    const gi = sections.findIndex((s) => s.key === (keep || 'games'));
    cat = gi >= 0 ? gi : 0;
    cats.innerHTML = '';
    items.innerHTML = '';
    sections.forEach((s, si) => {
      const c = el('div', 'xmb-cat', `${icon(s.icon)}<span>${esc(s.title)}</span>`);
      c.addEventListener('click', () => { if (si !== cat) { cat = si; sound.play('channel'); layout(); } });
      cats.append(c);
      const col = el('div', 'xmb-col');
      s.items.forEach((t, ii) => {
        const row = el('div', 'xmb-item');
        const pic = el('div', 'xmb-pic' + (t.type === 'game' || t.type === 'stream' ? ' wide' : ''));
        pic.append(itemArt(ctx, t, ['header', 'portrait']));
        row.append(pic, el('div', 'xmb-text', `<b>${esc(itemTitle(t))}</b><span>${esc(itemSub(ctx, t))}</span>`));
        row.addEventListener('click', () => {
          if (si === cat && (focus[s.key] || 0) === ii) { ctx.activate(); return; }
          cat = si; focus[s.key] = ii; sound.play('move'); layout();
        });
        col.append(row);
      });
      if (!s.items.length) col.append(el('div', 'xmb-empty', 'nothing here yet'));
      items.append(col);
    });
    layout();
  }

  function idx(s) {
    return Math.max(0, Math.min(s.items.length - 1, focus[s.key] || 0));
  }

  function layout() {
    const W = innerWidth;
    const H = innerHeight;
    const barY = H * 0.3;
    const x0 = W * 0.24;
    const gap = Math.max(110, W * 0.105);
    const iconH = H * 0.085;
    const k = ctx.scale();
    [...cats.children].forEach((c, i) => {
      const on = i === cat;
      c.classList.toggle('on', on);
      c.style.transform = `translate(${x0 + (i - cat) * gap - iconH / 2}px, ${barY - iconH / 2}px) scale(${on ? 1 : 0.78})`;
      c.style.width = iconH + 'px';
      c.style.height = iconH + 'px';
      c.style.opacity = on ? 1 : Math.abs(i - cat) > 4 ? 0 : 0.55;
    });
    [...items.children].forEach((col, si) => {
      const on = si === cat;
      col.classList.toggle('on', on);
      const s = sections[si];
      const f = idx(s);
      const step = H * 0.105 * k;
      const big = H * 0.16 * k;
      [...col.children].forEach((row, i) => {
        const d = i - f;
        let y;
        if (d === 0) y = barY + iconH * 0.75 + H * 0.03;
        else if (d > 0) y = barY + iconH * 0.75 + H * 0.03 + big + (d - 1) * step + H * 0.02;
        else y = barY - iconH * 0.9 - H * 0.03 + d * step;
        row.classList.toggle('on', on && d === 0);
        row.style.transform = `translate(${x0 - iconH / 2}px, ${y}px)`;
        row.style.setProperty('--h', (d === 0 ? big : step * 0.78) + 'px');
        row.style.opacity = !on ? 0 : d === 0 ? 1 : d < -2 || y < 0 || y > H * 1.05 ? 0 : 0.7;
      });
    });
    ctx.hints();
  }

  function current() {
    const s = sections[cat];
    return s && s.items[idx(s)];
  }

  function moveItem(d) {
    const s = sections[cat];
    if (!s || !s.items.length) return;
    const n = Math.max(0, Math.min(s.items.length - 1, idx(s) + d));
    if (n === idx(s)) return;
    focus[s.key] = n;
    sound.play('move');
    layout();
  }

  function moveCat(d) {
    const n = cat + d;
    if (n < 0 || n >= sections.length) return;
    cat = n;
    sound.play('channel');
    layout();
  }

  return {
    id: 'xmb',
    render,
    layout,
    current,
    handle(a) {
      if (a === 'up') moveItem(-1);
      else if (a === 'down') moveItem(1);
      else if (a === 'left' || a === 'lb') moveCat(-1);
      else if (a === 'right' || a === 'rb') moveCat(1);
      else if (a === 'lt') moveItem(-5);
      else if (a === 'rt') moveItem(5);
      else return false;
      return true;
    },
    home() {
      const gi = Math.max(0, sections.findIndex((s) => s.key === 'games'));
      const s = sections[cat];
      if (cat === gi && s && idx(s) === 0) return false;
      if (s && idx(s) !== 0) focus[s.key] = 0; else cat = gi;
      layout();
      return true;
    },
    goto(key) {
      const i = sections.findIndex((s) => s.key === key);
      if (i >= 0) { cat = i; focus[key] = 0; layout(); }
    },
    hints: () => [['lb', 'category']],
    destroy() { stopClock(); stopWave(); root.innerHTML = ''; },
  };
}
