// Simple line icons (24x24 viewBox, stroked with currentColor).

const P = {
  store: '<path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  friends: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15.5 14.2c2.6-.2 4.5 1.3 5 4.3"/>',
  downloads: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  bigpicture: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M9 20.5h6M12 17v3.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="14.5" cy="7" r="1.2"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  volume: '<path d="M4 18h2V14H4zM9 18h2V11H9zM14 18h2V8h-2zM19 18h2V5h-2z"/>',
  sparkle: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2z"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  rocket: '<path d="M12 3c3.5 2 5 5.5 5 9.5l-2.5 3h-5L7 12.5C7 8.5 8.5 5 12 3z"/><circle cx="12" cy="10" r="1.8"/><path d="M9.5 15.5 7 20l3.5-1.5M14.5 15.5 17 20l-3.5-1.5"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  power: '<path d="M12 3.5v8"/><path d="M7.2 6.5a7.5 7.5 0 1 0 9.6 0"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-4 3.8-6 7.5-6s6.6 2 7.5 6"/>',
  stream: '<path d="M4 17.5a3 3 0 0 1 3 3M4 13.5a7 7 0 0 1 7 7M4 9.5a11 11 0 0 1 11 11"/><path d="M8 4.5h11.5a1 1 0 0 1 1 1V16"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16.5V20"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  pin: '<path d="M9 4h6l-1 5 3.5 3.5h-11L10 9z"/><path d="M12 12.5V20"/>',
  library: '<path d="M5 4.5v15M9 4.5v15M13.5 5l4.5 14.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  controller: '<path d="M7 8h10a4 4 0 0 1 3.9 4.9l-.8 3.5a2 2 0 0 1-3.4 1L14.5 15h-5l-2.2 2.4a2 2 0 0 1-3.4-1l-.8-3.5A4 4 0 0 1 7 8z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".6"/><circle cx="17" cy="13" r=".6"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.grid}</svg>`;
}
