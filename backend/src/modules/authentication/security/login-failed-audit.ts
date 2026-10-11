import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import {
  loginAccountAttemptKey,
  loginIpAttemptKey,
} from '../login-attempt-limiter';

/*
  Paket 5.4.0-d (M6): the audit entry of a real credential rejection.

  Privacy is the whole point of this helper, so it is a pure function that can
  be asserted directly in a unit test:

    * the raw e-mail and the raw IP never enter the entry — neither does the
      password, the token or any part of a credential;
    * the two identifiers are the **same versioned HMAC keys** the rate limiter
      already writes in Redis (`…:account-state:v2:<digest>`, `…:ip:<digest>`),
      which keeps the pseudonyms stable and comparable across both records;
    * `loginIpAttemptKey` falls back to an *unkeyed* SHA-256 digest when no
      secret exists — that fallback is never used here. Without a key neither
      identifier is emitted at all: a bare digest of an e-mail address would be
      a reversible identifier, not a pseudonym.
*/

export type LoginFailedProvider = 'local' | 'entra';

export type LoginFailedAuditMetadata = {
  readonly provider: LoginFailedProvider;
  readonly reason: 'invalid_credentials';
  readonly accountKey?: string;
  readonly ipKey?: string;
};

/** The versioned HMAC identifiers, plus the generic provider/reason pair. */
export function buildLoginFailedAuditMetadata(input: {
  readonly provider: LoginFailedProvider;
  readonly email?: string | null;
  readonly ipAddress?: string | null;
  readonly hmacSecret?: string | null;
}): LoginFailedAuditMetadata {
  const metadata: {
    provider: LoginFailedProvider;
    reason: 'invalid_credentials';
    accountKey?: string;
    ipKey?: string;
  } = { provider: input.provider, reason: 'invalid_credentials' };
  const secret =
    typeof input.hmacSecret === 'string' && input.hmacSecret.trim().length > 0
      ? input.hmacSecret
      : null;
  if (secret === null) {
    return metadata;
  }
  const email = input.email ?? '';
  if (email.trim().length > 0) {
    metadata.accountKey = loginAccountAttemptKey(email, secret);
  }
  const ip = input.ipAddress ?? '';
  if (ip.trim().length > 0) {
    metadata.ipKey = loginIpAttemptKey(ip, secret);
  }
  return metadata;
}

/**
 * The entity id of the entry. `auth_event` rows are not backed by a user row,
 * so the pseudonymous account key carries the identity when it exists and a
 * constant marker stands in when it does not (no secret, or no e-mail).
 */
export function loginFailedEntityId(metadata: LoginFailedAuditMetadata): string {
  return metadata.accountKey ?? 'anonymous';
}

export const loginFailedAudit = {
  action: auditLogActions.authLoginFailed,
  entityType: auditLogEntityTypes.authEvent,
} as const;
