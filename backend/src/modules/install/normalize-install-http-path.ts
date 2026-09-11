export function normalizeInstallHttpPath(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const withoutQuery = raw.split('?')[0] ?? '';
  if (withoutQuery.trim().length === 0) {
    return '/';
  }
  const withLeadingSlash = withoutQuery.trim().startsWith('/')
    ? withoutQuery.trim()
    : `/${withoutQuery.trim()}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

export function normalizeInstallHttpMethod(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toUpperCase();
}
