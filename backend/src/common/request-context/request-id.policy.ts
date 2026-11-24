/*
  W1.6 (`BA-xcut-18`): `x-request-id` is attacker-controlled and used to be
  copied into everything — the response header, the error envelope, the
  recent-request log, the audit envelope (a hash-bound column), the DB query
  trace keys and the metrics warning line. Nothing bounded it: an 8 KB header
  landed in the audit chain and in the in-memory log buffer, and a value with a
  control character made `setHeader` throw.

  One policy, applied at every place that accepts the value:

    - at most 128 characters,
    - only `A-Z a-z 0-9 . _ : -`,
    - surrounding whitespace trimmed, empty is not an id.

  A value that does not fit is **replaced by a generated UUID**, never rejected
  and never truncated. Rejecting would break callers behind a proxy that sends
  its own long id; truncating would silently alias two different requests under
  one id, which is worse than losing the caller's id. The gateway/proxy id stays
  visible in the proxy's own logs; inside this system the correlation id is
  always ours and always well formed.
*/

export const requestIdMaxLength = 128;

/**
 * Visible ASCII letters, digits and the separators real tracers emit
 * (`req-1`, `a1b2c3d4-…`, `trace:span`, `svc_42`). No spaces, no quotes, no
 * control characters, no non-ASCII: the value can be logged, echoed and hashed
 * without escaping and cannot inject a line into a log or a header.
 */
export const requestIdPattern = /^[A-Za-z0-9._:-]+$/u;

export function sanitizeRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > requestIdMaxLength) return null;
  if (!requestIdPattern.test(trimmed)) return null;
  return trimmed;
}

export function isWellFormedRequestId(value: unknown): value is string {
  return sanitizeRequestId(value) !== null;
}
