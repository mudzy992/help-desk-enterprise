/**
 * Rukom pisani, minimalni stroke-sistem ikona (24×24, currentColor).
 * Bez vanjskih zavisnosti — čitljivo i oštro na svakoj DPI vrijednosti.
 */
export type IconName =
  | 'logo'
  | 'wifi'
  | 'wifi-off'
  | 'refresh'
  | 'search'
  | 'chevron-left'
  | 'external'
  | 'send'
  | 'remote'
  | 'alert'
  | 'mail'
  | 'lock'
  | 'globe'
  | 'inbox'
  | 'clock'
  | 'check'
  | 'user'
  | 'bell';

const paths: Record<IconName, string> = {
  logo: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M3 14a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-2z"/><path d="M21 14a2 2 0 0 0-2-2h-1a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2v-2z"/><path d="M19 16v1.5a2.5 2.5 0 0 1-2.5 2.5H13"/>',
  wifi: '<path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="19.8" r="0.4"/>',
  'wifi-off': '<path d="m2 2 20 20"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M5 12.86a11 11 0 0 1 4.37-2.56"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/>',
  'chevron-left': '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  remote: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20.5h7"/><path d="M12 16.5v4"/><circle cx="12" cy="10.2" r="2.2"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 7.5V13"/><path d="M12 16.5h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m21 7-9 6-9-6"/>',
  lock: '<rect x="4.5" y="11" width="15" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.5 2.6 3.8 5.8 3.8 9.5s-1.3 6.9-3.8 9.5c-2.5-2.6-3.8-5.8-3.8-9.5S9.5 5.1 12 2.5z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-1a7.5 7.5 0 0 1 15 0v1"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
};

export function icon(name: IconName, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

/** Ubaci ikonu u postojeći element (uz zadržavanje tekst labela). */
export function mountIcon(host: Element, name: IconName, size = 18): void {
  host.insertAdjacentHTML('afterbegin', icon(name, size));
}
