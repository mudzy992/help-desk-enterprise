import { resolveCorsOrigin } from './resolve-cors-origin';

export function isAllowedOrigin(origin: unknown): boolean {
  if (typeof origin !== 'string' || origin.length === 0) {
    return false;
  }
  const allowed = resolveCorsOrigin();
  if (allowed === false) {
    return false;
  }
  return Array.isArray(allowed) ? allowed.includes(origin) : allowed === origin;
}
