// Channels: pages of rounded channel tiles (4 x 3) on a light pinstripe
// background, a curved bottom bar with the clock and two round buttons,
// and a channel preview screen (menu / start) before a game starts.
// Games, apps, streams and videos are channels; search, social, steam and
// settings are folder channels that open their own page of channels.
import { itemTitle, itemSub, itemArt, runClock } from './common.js';

const COLS = 4;
const ROWS = 3;
const PER = COLS * ROWS;
const FOLDERS = ['search', 'social', 'steam', 'settings'];

export default function createWii(ctx, root) {
  const { el, esc, icon, state, sound } = ctx;
  let channels = [];     // current grid (main or a folder)
  let main = [];
  let folder = null;     // { title, items, back: index in main }
  let i = 0;             // focused channel; -1/-2 = left/right round button
  let preview = null;    // { tile, btn: 0 menu | 1 start }

  root.innerHTML = '';
  const box = el('div', 'wii');
  const pages = el('div', 'wii-pages');
  const arrowL = el('button', 'wii-arrow l', '&#9664;');
  const arrowR = el('button', 'wii-arrow r', '&#9654;');
  const bar = el('div', 'wii-bar', `
    <svg class="wii-curve" viewBox="0 0 1000 120" preserveAspectRatio="none"><path d="M0 40 Q 160 40 220 10 L 780 10 Q 840 40 1000 40 L 1000 120 L 0 120 Z"/></svg>
    <button class="wii-round left">${icon('gear')}</button>
    <div class="wii-time"><b></b><span></span></div>
    <button class="wii-round right">${icon('friends')}</button>`);
  const pv = el('div', 'wii-preview');
  const title = el('div', 'wii-folder');
  box.append(pages, arrowL, arrowR, title, bar, pv);
  root.append(box);
  const stopClock = runClock(bar.querySelector('.wii-time b'));
  const dateEl = bar.querySelector('.wii-time span');
  dateEl.textContent = new Date().toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
  arrowL.addEventListener('click', () => page(-1));
  arrowR.addEventListener('click', () => page(1));
  bar.querySelector('.left').addEventListener('click', () => { i = -1; layout(); press(); });
  bar.querySelector('.right').addEventListener('click', () => { i = -2; layout(); press(); });

  function buildMain() {
    const secs = ctx.catalog();
    // Games and the rest first, folder channels after them. Settings and
    // social are also on the round buttons.
    const list = [];
    const folders = [];
    for (const s of secs) {
      if (FOLDERS.includes(s.key)) folders.push({ key: 'folder:' + s.key, type: 'folder', title: s.title, label: s.title, icon: s.icon, folder: s });
      else list.push(...s.items);
    }
    return list.concat(folders);
  }

  function render() {
    const keep = channels[i] && channels[i].key;
    main = buildMain();
    if (folder) {
      const s = ctx.catalog().find((x) => x.key === folder.key);
      folder.items = s ? s.items : [];
      channels = folder.items;
    } else channels = main;
    const k = channels.findIndex((t) => t.key === keep);
    if (k >= 0) i = k; else if (i >= channels.length) i = Math.max(0, channels.length - 1);
    draw();
  }

  function draw() {
    pages.innerHTML = '';
    const n = Math.max(1, Math.ceil(channels.length / PER));
    for (let p = 0; p < n; p++) {
      const pg = el('div', 'wii-page');
      for (let s = 0; s < PER; s++) {
        const t = channels[p * PER + s];
        const c = el('div', 'wii-ch' + (t ? '' : ' empty'));
        if (t) {
          const k = p * PER + s;
          if (t.type === 'folder') c.append(el('div', 'art art-icon folder', `${icon(t.icon)}<b>${esc(t.title)}</b>`));
          else if (t.type === 'icon') c.append(el('div', 'art art-icon folder', `${icon(t.icon || 'grid')}<b>${esc(itemTitle(t))}</b>`));
          else if (t.type === 'friend' || t.type === 'avatar' || t.type === 'profile') {
            const face = el('div', 'art art-icon folder');
            const pic = itemArt(ctx, t);
            pic.className = 'wii-face';
            face.append(pic, el('b', '', esc(itemTitle(t))));
            c.append(face);
          }
          else c.append(itemArt(ctx, t, ['header', 'portrait']));
          c.append(el('div', 'wii-name', esc(itemTitle(t))));
          c.addEventListener('click', () => { if (k === i) press(); else { i = k; sound.play('move'); layout(); } });
        }
        pg.append(c);
      }
      pages.append(pg);
    }
    title.textContent = folder ? folder.title : '';
    title.classList.toggle('show', !!folder);
    layout();
  }

  function layout() {
    const W = innerWidth;
    const H = innerHeight;
    const gap = Math.max(10, W * 0.016);
    const cw = Math.min((W * 0.84 - gap * (COLS - 1)) / COLS, ((H * 0.64 - gap * (ROWS - 1)) / ROWS) * 1.6);
    const ch = cw / 1.6;
    const gridW = cw * COLS + gap * (COLS - 1);
    box.style.setProperty('--cw', cw + 'px');
    box.style.setProperty('--ch', ch + 'px');
    box.style.setProperty('--gap', gap + 'px');
    const pageNow = i >= 0 ? Math.floor(i / PER) : (pages.dataset.page | 0);
    pages.dataset.page = pageNow;
    pages.style.left = (W - gridW) / 2 + 'px';
    pages.style.top = H * 0.08 + 'px';
    pages.style.transform = `translateX(${-pageNow * (gridW + W * 0.2)}px)`;
    [...pages.children].forEach((pg, p) => { pg.style.left = p * (gridW + W * 0.2) + 'px'; });
    const all = pages.querySelectorAll('.wii-ch');
    all.forEach((c, k) => c.classList.toggle('on', k === i && !preview));
    const n = pages.children.length;
    arrowL.classList.toggle('show', pageNow > 0);
    arrowR.classList.toggle('show', pageNow < n - 1);
    bar.querySelector('.left').classList.toggle('on', i === -1);
    bar.querySelector('.right').classList.toggle('on', i === -2);
    ctx.hints();
  }

  function page(d) {
    const n = Math.ceil(channels.length / PER);
    const p = Math.floor(Math.max(0, i) / PER) + d;
    if (p < 0 || p >= n) return false;
    i = Math.min(channels.length - 1, p * PER + (Math.max(0, i) % PER));
    sound.play('channel');
    layout();
    return true;
  }

  function move(dir) {
    if (i < 0) {
      // On the round buttons: up goes back to the grid, left/right swap.
      if (dir === 'up') { i = Math.min(channels.length - 1, Math.floor((pages.dataset.page | 0) * PER + PER - COLS)); sound.play('move'); layout(); }
      else if (dir === 'left' || dir === 'right') { i = i === -1 ? -2 : -1; sound.play('move'); layout(); }
      return;
    }
    const p = Math.floor(i / PER);
    const s = i % PER;
    const r = Math.floor(s / COLS);
    const c = s % COLS;
    let n = i;
    if (dir === 'left') { if (c > 0) n = i - 1; else { page(-1); return; } }
    if (dir === 'right') { if (c < COLS - 1 && i + 1 < channels.length) n = i + 1; else if (c === COLS - 1) { page(1); return; } }
    if (dir === 'up' && r > 0) n = i - COLS;
    if (dir === 'down') {
      if (r < ROWS - 1 && i + COLS < channels.length) n = i + COLS;
      else { i = c < COLS / 2 ? -1 : -2; sound.play('move'); layout(); return; }
    }
    if (n !== i && n >= p * 0) { i = n; sound.play('move'); layout(); }
  }

  function openFolder(t) {
    folder = { key: t.folder.key, title: t.folder.title, items: t.folder.items, back: i };
    channels = folder.items;
    i = 0;
    sound.play('open');
    draw();
  }

  function closeFolder() {
    const back = folder.back;
    folder = null;
    channels = main;
    i = Math.min(back, channels.length - 1);
    sound.play('back');
    draw();
  }

  function showPreview(t) {
    preview = { tile: t, btn: 1 };
    pv.innerHTML = '';
    const frame = el('div', 'wii-pv-frame');
    frame.append(itemArt(ctx, t, ['hero', 'header', 'portrait']));
    frame.append(el('div', 'wii-pv-text', `<b>${esc(itemTitle(t))}</b><span>${esc(itemSub(ctx, t))}</span>`));
    const btns = el('div', 'wii-pv-btns', '<button class="wii-btn menu">menu</button><button class="wii-btn start">start</button>');
    btns.querySelector('.menu').addEventListener('click', () => closePreview());
    btns.querySelector('.start').addEventListener('click', () => { const tile = preview.tile; sound.play('select'); ctx.play(tile); setTimeout(() => closePreview(true), 500); });
    pv.append(frame, btns);
    pv.classList.add('show');
    sound.play('open');
    previewLayout();
  }

  function previewLayout() {
    pv.querySelector('.menu').classList.toggle('on', preview && preview.btn === 0);
    pv.querySelector('.start').classList.toggle('on', preview && preview.btn === 1);
    layout();
  }

  function closePreview(silent) {
    if (!preview) return;
    preview = null;
    pv.classList.remove('show');
    if (!silent) sound.play('back');
    layout();
  }

  // A on a channel: folders open, games and streams get the preview
  // screen, everything else runs straight away (handled by app.js).
  function press() {
    if (i === -1) { const s = main.find((t) => t.type === 'folder' && t.folder.key === 'settings'); if (s) openFolder(s); return true; }
    if (i === -2) { const s = main.find((t) => t.type === 'folder' && t.folder.key === 'social'); if (s) openFolder(s); return true; }
    const t = channels[i];
    if (!t) return true;
    if (t.type === 'folder') { openFolder(t); return true; }
    if (t.type === 'game' || t.type === 'stream') { showPreview(t); return true; }
    return false;
  }

  return {
    id: 'wii',
    render,
    layout,
    current() {
      if (preview) return preview.tile;
      return i >= 0 ? channels[i] : null;
    },
    handle(a) {
      if (preview) {
        if (a === 'left' || a === 'right') { preview.btn = a === 'left' ? 0 : 1; sound.play('move'); previewLayout(); return true; }
        if (a === 'b') { closePreview(); return true; }
        if (a === 'a') {
          if (preview.btn === 0) { closePreview(); return true; }
          sound.play('select');
          ctx.play(preview.tile);
          setTimeout(() => closePreview(true), 500);
          return true;
        }
        return a === 'up' || a === 'down' || a === 'lb' || a === 'rb';
      }
      if (a === 'left' || a === 'right' || a === 'up' || a === 'down') { move(a); return true; }
      if (a === 'lb' || a === 'rb') { page(a === 'lb' ? -1 : 1); return true; }
      if (a === 'a') return press();
      return false;
    },
    home() {
      if (preview) { closePreview(true); return true; }
      if (folder) { closeFolder(); return false; }
      if (i === 0) return false;
      i = 0;
      layout();
      return true;
    },
    goto(key) {
      if (preview) closePreview(true);
      const t = main.find((x) => x.type === 'folder' && x.folder.key === key);
      if (t) { if (folder) { folder = null; channels = main; } openFolder(t); }
    },
    hints: () => (preview ? [['b', 'menu']] : folder ? [['b', 'back'], ['lb', 'page']] : [['lb', 'page']]),
    destroy() { stopClock(); root.innerHTML = ''; },
  };
}
