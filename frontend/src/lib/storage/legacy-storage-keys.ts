/**
 * Paket 4.1 (§7): localStorage keys were renamed to the neutral
 * `service-desk.*`. Old values move to the new key once (theme, language,
 * session and idle marker survive), then the old key is removed. The same
 * table is mirrored by the pre-paint script in `index.html`, which runs first.
 */
export const legacyStorageKeys: readonly (readonly [legacy: string, current: string])[] = [
  ["ep-helpdesk.theme.design", "service-desk.theme.design"],
  ["ep-helpdesk.theme.mode", "service-desk.theme.mode"],
  ["ep-helpdesk.theme.accent", "service-desk.theme.accent"],
  ["ep-helpdesk.session", "service-desk.session"],
  ["ep-helpdesk.timeActivityAt", "service-desk.timeActivityAt"],
  ["ephelpdesk.locale", "service-desk.locale"],
];

export function migrateLegacyStorageKeys(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): void {
  for (const [legacy, current] of legacyStorageKeys) {
    try {
      const value = storage.getItem(legacy);
      if (value === null) continue;
      if (storage.getItem(current) === null) storage.setItem(current, value);
      storage.removeItem(legacy);
    } catch {
      // Storage disabled or full: the app falls back to defaults, as before.
    }
  }
}
