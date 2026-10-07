/**
 * Paket 5.2.2 (M1 #3): the setup gate must not turn a database outage into the
 * friendlier "setup required" answer. Connection/initialization failures are
 * reported as a distinct 503 so `/health/ready` and the install UI disagree.
 */
const databaseUnavailableCodes = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server timed out during connection
  'P1003', // Database does not exist
  'P1008', // Operation timed out
  'P1010', // User was denied access
  'P1011', // Error opening TLS connection
  'P1017', // Server has closed the connection
]);

const databaseUnavailableMessages = [
  "can't reach database server",
  'database server timed out during connection',
  'database does not exist',
  'timed out',
  'connection terminated',
  'connection refused',
  'econnrefused',
  'enotfound',
  'password authentication failed',
  'server closed the connection',
];

export function isInstallDatabaseUnavailableError(error: unknown): boolean {
  return scan(error, 0, new Set());
}

function scan(value: unknown, depth: number, seen: Set<unknown>): boolean {
  if (depth > 6 || value === null || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const field of ['code', 'errorCode', 'originalCode']) {
    const code = record[field];
    if (typeof code === 'string' && databaseUnavailableCodes.has(code)) {
      return true;
    }
  }
  for (const field of ['message', 'originalMessage', 'metaMessage']) {
    const message = record[field];
    if (
      typeof message === 'string' &&
      databaseUnavailableMessages.some((needle) =>
        message.toLowerCase().includes(needle),
      )
    ) {
      return true;
    }
  }
  const meta = record.meta as Record<string, unknown> | undefined;
  return (
    scan(record.cause, depth + 1, seen) ||
    scan(record.error, depth + 1, seen) ||
    scan(meta, depth + 1, seen) ||
    scan(meta?.driverAdapterError, depth + 1, seen)
  );
}
