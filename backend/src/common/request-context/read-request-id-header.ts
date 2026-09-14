export function readRequestIdHeader(headers: unknown): string | null {
  if (typeof headers !== 'object' || headers === null) {
    return null;
  }
  const record = headers as Record<string, unknown>;
  return firstHeader(record['x-request-id']) ?? firstHeader(record['x-requestid']);
}

function firstHeader(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (
    Array.isArray(value) &&
    typeof value[0] === 'string' &&
    value[0].trim().length > 0
  ) {
    return value[0].trim();
  }
  return null;
}
