/** Paket 2.1: "Chrome · Windows" from a User-Agent — enough to recognise a device. */
export type DeviceDescription = {
  readonly browser: string;
  readonly os: string | null;
};

const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function describeUserAgent(userAgent: string | null): DeviceDescription | null {
  if (!userAgent) return null;
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  if (browser === null && os === null) return null;
  return { browser: browser ?? "—", os };
}

export function formatDevice(description: DeviceDescription | null, unknownLabel: string): string {
  if (description === null) return unknownLabel;
  return description.os ? `${description.browser} · ${description.os}` : description.browser;
}
