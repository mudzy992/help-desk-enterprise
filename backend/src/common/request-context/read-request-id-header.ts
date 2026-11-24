import { sanitizeRequestId } from './request-id.policy';

/*
  W1.6 (`BA-xcut-18`): this is the only place that may look at an inbound
  correlation id. Everything downstream (log prefix, recent-request log, error
  envelope, audit row, DB trace keys) reads the id from the request context, so a
  value that fails `sanitizeRequestId` simply never enters the system and the
  caller gets a generated one instead.

  Duplicated headers arrive joined with `, ` — the first segment wins, which is
  what a tracer behind a proxy expects; the joined string itself would fail the
  policy and be replaced.
*/
export function readRequestIdHeader(headers: unknown): string | null {
  if (typeof headers !== 'object' || headers === null) {
    return null;
  }
  const record = headers as Record<string, unknown>;
  return firstHeader(record['x-request-id']) ?? firstHeader(record['x-requestid']);
}

function firstHeader(value: unknown): string | null {
  if (typeof value === 'string') {
    return sanitizeRequestId(firstSegment(value));
  }
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' && item.trim().length > 0);
    return typeof first === 'string' ? sanitizeRequestId(firstSegment(first)) : null;
  }
  return null;
}

function firstSegment(value: string): string {
  const comma = value.indexOf(',');
  return (comma === -1 ? value : value.slice(0, comma)).trim();
}
