/**
 * Staging k6 (2026-09-24): when the pool ran dry the API answered a bare 500.
 * Pool exhaustion and the statement timeout are overload, not a bug — they are
 * reported as `503 DATABASE_BUSY` with `Retry-After`, so clients and the load
 * balancer back off and the dashboards separate "overloaded" from "broken".
 *
 * Recognised (anywhere in the `cause` / Prisma `meta` chain):
 *  - pg-pool: "timeout exceeded when trying to connect",
 *    "Connection terminated due to connection timeout";
 *  - Postgres 57014 "canceling statement due to statement timeout";
 *  - Prisma P2024 (pool timeout) and P1008 (operation timed out).
 */
const saturationCodes = new Set(['57014', 'P2024', 'P1008']);
const saturationMessages = [
  'timeout exceeded when trying to connect',
  'connection terminated due to connection timeout',
  'canceling statement due to statement timeout',
];

export function isDatabaseSaturationError(error: unknown): boolean {
  return scan(error, 0, new Set());
}

function scan(value: unknown, depth: number, seen: Set<unknown>): boolean {
  if (depth > 5 || value === null || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const field of ['code', 'originalCode']) {
    const code = record[field];
    if (typeof code === 'string' && saturationCodes.has(code)) {
      return true;
    }
  }
  for (const field of ['message', 'originalMessage']) {
    const message = record[field];
    if (
      typeof message === 'string' &&
      saturationMessages.some((needle) => message.toLowerCase().includes(needle))
    ) {
      return true;
    }
  }
  const meta = record.meta as Record<string, unknown> | undefined;
  return (
    scan(record.cause, depth + 1, seen) ||
    scan(meta, depth + 1, seen) ||
    scan(meta?.driverAdapterError, depth + 1, seen)
  );
}
