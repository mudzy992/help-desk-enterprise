import { dateTimeFormatter } from "@/lib/date-time-formatter";
/**
 * Install wizard v2 the time zone the installation reports in. The list
 * comes from the runtime (`Intl.supportedValuesOf`) so it matches the tzdata the
 * server and the browser share; the short fallback keeps older engines usable —
 * the backend validates the value again (`is-supported-install-time-zone.ts`).
 */
const fallbackTimeZones = [
  "UTC",
  "Europe/Sarajevo",
  "Europe/Zagreb",
  "Europe/Belgrade",
  "Europe/Ljubljana",
  "Europe/Skopje",
  "Europe/Podgorica",
  "Europe/Vienna",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/London",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

/** The default the step opens with — the same value the reports settings ship. */
export const defaultInstallTimeZone = "Europe/Sarajevo";

export function listInstallTimeZones(): readonly string[] {
  const supported = readSupportedTimeZones();
  if (supported === null) {
    return fallbackTimeZones;
  }
  // The default must always be offered, even if the runtime were to drop it.
  return supported.includes(defaultInstallTimeZone)
    ? supported
    : [defaultInstallTimeZone, ...supported];
}

export function isInstallTimeZoneSupported(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return false;
  }
  if (listInstallTimeZones().includes(normalized)) {
    return true;
  }
  // A zone that is valid for the runtime but missing from the list (e.g. a
  // hand-typed alias) is accepted as long as the runtime can format with it.
  try {
    dateTimeFormatter("en-US", { timeZone: normalized });
    return true;
  } catch {
    return false;
  }
}

function readSupportedTimeZones(): readonly string[] | null {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => readonly string[];
  };
  if (typeof intl.supportedValuesOf !== "function") {
    return null;
  }
  try {
    const zones = intl.supportedValuesOf("timeZone");
    return zones.length === 0 ? null : [...zones].sort();
  } catch {
    return null;
  }
}
