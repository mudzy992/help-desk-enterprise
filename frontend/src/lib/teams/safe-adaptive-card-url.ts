/** Allow only explicit web links from Adaptive Card payloads. */
export function safeAdaptiveCardUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
