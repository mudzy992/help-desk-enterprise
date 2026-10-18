const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Reuses immutable Intl formatters while preserving every caller's locale/options contract. */
export function dateTimeFormatter(
  locale: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const locales = Array.isArray(locale) ? locale.join("\u0000") : String(locale);
  const key = `${locales}\u0001${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
}

export function resetDateTimeFormatterCacheForTests(): void {
  formatterCache.clear();
}
