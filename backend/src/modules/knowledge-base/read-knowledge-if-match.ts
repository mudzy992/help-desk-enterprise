import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';

/**
 * W7.51 (BA-knowledge-base-03): `If-Match` carries the revision the editor
 * loaded. It is optional — without it the write still compares the row inside
 * the transaction — but a client that sends it gets a hard 409 instead of a
 * silent overwrite of somebody else's edit.
 */
export function readKnowledgeIfMatch(
  request: AuthenticatedHttpRequest,
): string | undefined {
  const header = request.headers['if-match'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}
