import { HttpException } from '@nestjs/common';
import { KnowledgeBaseError } from '../knowledge-base/knowledge-base.error';
import { TicketsError } from '../tickets/tickets.error';

/**
 * W7.62 (BA-search-08): the three groups of `GET /search` used to run in one
 * `Promise.all`, so a failure anywhere failed the whole answer — including a
 * transient failure of a group the caller could have lived without. The same
 * `Promise.all` is also what a "just catch everything" fix would break: an
 * authorization failure would silently become an empty group.
 *
 * This module draws the line once, so the service and its tests cannot draw it
 * differently:
 *
 * - **authorization** (401/403, or a domain `FORBIDDEN`/`UNAUTHORIZED` code) is
 *   a decision about the caller, never about availability. It always fails the
 *   whole request: a partial answer must never mask "you may not see this".
 * - **client** (any other 4xx) means the request as issued cannot be processed
 *   (a malformed filter, a broken reference). The client cannot act on a
 *   partial answer built around it, so it also fails the whole request.
 * - **availability** (5xx, connection/timeout/unknown errors) is the only class
 *   that may degrade to a controlled partial answer, and even then the group is
 *   named in `failedGroups` — never reported as "no matches".
 */
export type SearchGroupFailureClass = 'authorization' | 'client' | 'availability';

const authorizationErrorCodes = new Set(['FORBIDDEN', 'UNAUTHORIZED']);

export function classifySearchGroupFailure(
  error: unknown,
): SearchGroupFailureClass {
  const status = httpStatusOf(error);
  if (status === 401 || status === 403) {
    return 'authorization';
  }
  if (status !== null && status >= 400 && status < 500) {
    return 'client';
  }
  const code = errorCodeOf(error);
  if (code !== null && authorizationErrorCodes.has(code)) {
    return 'authorization';
  }
  if (isDomainError(error)) {
    // The group's own domain refused the read (a decision about the request:
    // forbidden, not found, invalid reference). Search issues its queries
    // itself, so such an answer means the request cannot be satisfied as
    // issued — a partial group would hide it behind an empty list.
    return 'client';
  }
  return 'availability';
}

function isDomainError(error: unknown): boolean {
  return error instanceof KnowledgeBaseError || error instanceof TicketsError;
}

/**
 * `true` when the failure must fail the whole request instead of degrading to a
 * partial group. Kept as one predicate so the service has a single branch.
 */
export function isFatalSearchGroupFailure(error: unknown): boolean {
  return classifySearchGroupFailure(error) !== 'availability';
}

function httpStatusOf(error: unknown): number | null {
  if (!(error instanceof HttpException)) {
    return null;
  }
  const status = error.getStatus();
  return Number.isFinite(status) ? status : null;
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
