// Turns keyboard and gamepad input into dashboard actions:
// up down left right a b x y lb rb lt rt start view guide

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  Enter: 'a', ' ': 'a', Escape: 'b', Backspace: 'b',
  x: 'x', y: 'y', q: 'lb', e: 'rb', PageUp: 'lt', PageDown: 'rt',
  Tab: 'view', g: 'guide', Home: 'guide', m: 'start', F11: 'fullscreen',
};

// Standard gamepad mapping.
const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'start', null, null, 'up', 'down', 'left', 'right', 'guide'];
const REPEATS = new Set(['up', 'down', 'left', 'right', 'lt', 'rt']);
const FIRST_REPEAT = 380;
const REPEAT = 95;

export function startInput(handler) {
  window.addEventListener('keydown', (e) => {
    const action = KEYS[e.key] || KEYS[e.key.toLowerCase && e.key.toLowerCase()];
    if (!action || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    handler(action, { repeat: e.repeat, source: 'key' });
  });

  const held = new Map();
  let focused = true;
  function pressed(pad) {
    const out = new Set();
    pad.buttons.forEach((b, i) => {
      if (BUTTONS[i] && (b.pressed || b.value > 0.6)) out.add(BUTTONS[i]);
    });
    const [lx = 0, ly = 0] = pad.axes;
    if (lx < -0.55) out.add('left');
    if (lx > 0.55) out.add('right');
    if (ly < -0.55) out.add('up');
    if (ly > 0.55) out.add('down');
    return out;
  }

  function poll(now) {
    requestAnimationFrame(poll);
    // A game launched from here may be running in front of us: never react
    // to the controller unless our window has focus.
    if (!document.hasFocus()) { held.clear(); focused = false; return; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const down = new Set();
    for (const p of pads) if (p && p.connected) for (const a of pressed(p)) down.add(a);
    if (!focused) {
      // Buttons still held from the game (say, A on its quit menu) must be
      // released before they count here.
      focused = true;
      for (const a of down) held.set(a, { next: Infinity });
      return;
    }
    for (const a of [...held.keys()]) if (!down.has(a)) held.delete(a);
    for (const a of down) {
      const h = held.get(a);
      if (!h) {
        held.set(a, { next: now + FIRST_REPEAT });
        handler(a, { repeat: false, source: 'pad' });
      } else if (REPEATS.has(a) && now >= h.next) {
        h.next = now + REPEAT;
        handler(a, { repeat: true, source: 'pad' });
      }
    }
  }
  requestAnimationFrame(poll);
}
