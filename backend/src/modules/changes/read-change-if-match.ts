import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';

/**
 * W7.71 (`BA-changes-15`): `If-Match` carries the revision the template editor
 * loaded. Unlike the knowledge article (W7.51), the header is mandatory for a
 * template edit: the template has no other precondition, so without it the
 * service would have nothing to compare a stale editor against and the
 * last-write-wins hole from the audit would stay open.
 */
export function readChangeIfMatch(
  request: AuthenticatedHttpRequest,
): string | undefined {
  const value = request.headers?.['if-match'];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
