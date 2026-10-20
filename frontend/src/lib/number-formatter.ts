const formatterCache = new Map<string, Intl.NumberFormat>();

/** Reuses immutable number formatters for repeated table and dashboard renders. */
export function numberFormatter(
  locale: Intl.LocalesArgument,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const locales = Array.isArray(locale) ? locale.join("\u0000") : String(locale);
  const key = `${locales}\u0001${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached !== undefined) return cached;
  const formatter = new Intl.NumberFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
}

export function resetNumberFormatterCacheForTests(): void {
  formatterCache.clear();
}
