// The always-on-top notification window shown over games.
import * as sound from './sound.js';

const api = window.nostalgia;
const t = document.getElementById('toast');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

api.getSettings().then((s) => sound.configure(s)).catch(() => {});
api.soundPack().then((f) => sound.loadPack(f)).catch(() => {});
api.onNotice(({ title, msg, img }) => {
  t.classList.remove('show');
  void t.offsetWidth;
  t.innerHTML = `<div class="n-ring">${img ? `<img alt="" src="${esc(img)}">` : '<img class="n-logo" alt="" src="logo.svg">'}</div><div class="n-text"><small>${esc(title)}</small><b>${esc(msg)}</b></div>`;
  t.classList.add('show');
  sound.play('notify');
  setTimeout(() => t.classList.remove('show'), 5200);
});
