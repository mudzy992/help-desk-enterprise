export function resolveSocketCorsOrigin(): string | false {
  const origin = process.env.CORS_ORIGIN;
  if (typeof origin !== 'string' || origin.trim().length === 0) {
    return false;
  }
  return origin.trim();
}
