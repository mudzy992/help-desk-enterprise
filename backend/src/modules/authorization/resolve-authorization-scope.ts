import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import type { AuthorizationScopeLocator } from './authorization.types';

function readRecordValue(
  record: Record<string, unknown> | undefined,
  field: string,
): string | null {
  if (record === undefined) {
    return null;
  }
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function readBodyValue(body: unknown, field: string): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  return readRecordValue(body as Record<string, unknown>, field);
}

export function resolveAuthorizationScopeValue(
  request: AuthenticatedHttpRequest,
  locator: AuthorizationScopeLocator | null,
): string | null {
  if (locator === null || locator.field.trim().length === 0) {
    return null;
  }
  const field = locator.field.trim();
  return (
    readRecordValue(request.params, field) ??
    readBodyValue(request.body, field) ??
    readRecordValue(request.query, field)
  );
}
