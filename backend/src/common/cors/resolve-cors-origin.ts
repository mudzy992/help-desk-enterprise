export function resolveCorsOrigin(): string | string[] | false {
  const origin = process.env.CORS_ORIGIN;
  if (typeof origin !== 'string' || origin.trim().length === 0) {
    return false;
  }
  const allowed = origin
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '*');
  if (allowed.length === 0) {
    return false;
  }
  if (allowed.length === 1) {
    return allowed[0] ?? false;
  }
  return allowed;
}
