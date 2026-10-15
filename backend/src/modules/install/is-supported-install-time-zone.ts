/**
 * Install wizard v2 (F2): the time zone comes from the operator, so it is
 * checked against the runtime's IANA database instead of a hand-kept list that
 * would silently rot. `Intl.supportedValuesOf` exists on Node 18+ and every
 * browser this app supports; the fallback only has to prove the zone parses.
 */
export function isSupportedInstallTimeZone(value: string): boolean {
  const supportedValues = (
    Intl as unknown as { supportedValuesOf?: (key: string) => readonly string[] }
  ).supportedValuesOf;
  if (typeof supportedValues === 'function') {
    try {
      return supportedValues.call(Intl, 'timeZone').includes(value);
    } catch {
      // Older engines throw for an unknown key — fall through to the probe.
    }
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
