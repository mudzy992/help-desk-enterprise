import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { loginAccountAttemptKey, loginIpAttemptKey } from '../login-attempt-limiter';
import {
  buildLoginFailedAuditMetadata,
  loginFailedEntityId,
  loginFailedAudit,
} from './login-failed-audit';

/*
  Paket 5.4.0-d (M6): the privacy contract of `auth.login_failed`. These tests
  are the proof the design asks for — they assert on the **serialized** entry
  input, so a future refactor that starts storing the raw address fails here
  instead of leaking it into the immutable audit chain.
*/

const email = 'Ana.Anic@Example.COM';
const ip = '203.0.113.77';
const secret = 'wave-d-test-hmac-secret';

describe('buildLoginFailedAuditMetadata', () => {
  it('records the provider and the reason without any identifier when no key exists', () => {
    const metadata = buildLoginFailedAuditMetadata({
      provider: 'local',
      email,
      ipAddress: ip,
      hmacSecret: null,
    });
    expect(metadata).toEqual({ provider: 'local', reason: 'invalid_credentials' });
    expect(JSON.stringify(metadata)).not.toContain('@');
    expect(JSON.stringify(metadata)).not.toContain('203.0.113.77');
  });

  it('treats a blank key exactly like a missing one instead of writing an unkeyed digest', () => {
    const metadata = buildLoginFailedAuditMetadata({
      provider: 'entra',
      email,
      ipAddress: ip,
      hmacSecret: '   ',
    });
    expect(metadata.accountKey).toBeUndefined();
    expect(metadata.ipKey).toBeUndefined();
  });

  it('reuses the rate-limiter\u2019s versioned HMAC keys so both records share one pseudonym', () => {
    const metadata = buildLoginFailedAuditMetadata({
      provider: 'local',
      email,
      ipAddress: ip,
      hmacSecret: secret,
    });
    expect(metadata.accountKey).toBe(loginAccountAttemptKey(email, secret));
    expect(metadata.ipKey).toBe(loginIpAttemptKey(ip, secret));
    // The pseudonym is stable across the case and whitespace variants of one
    // address, exactly like the counter it mirrors.
    expect(
      buildLoginFailedAuditMetadata({
        provider: 'local',
        email: '  ana.anic@example.com ',
        ipAddress: ip,
        hmacSecret: secret,
      }).accountKey,
    ).toBe(metadata.accountKey);
  });

  it('never writes the raw e-mail, the raw IP, the password or any credential into the entry', () => {
    const metadata = buildLoginFailedAuditMetadata({
      provider: 'local',
      email,
      ipAddress: ip,
      hmacSecret: secret,
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('ana.anic');
    expect(serialized).not.toContain('Ana.Anic');
    expect(serialized).not.toContain('@example.com');
    expect(serialized).not.toContain('203.0.113');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    // 64 hex characters per pseudonym, nothing else may follow.
    expect(metadata.accountKey).toMatch(/^auth:login-fail:account-state:v2:[0-9a-f]{64}$/);
    expect(metadata.ipKey).toMatch(/^auth:login-fail:ip:[0-9a-f]{64}$/);
  });

  it('omits only the missing half when the request had no address', () => {
    const metadata = buildLoginFailedAuditMetadata({
      provider: 'entra',
      email: null,
      ipAddress: null,
      hmacSecret: secret,
    });
    expect(metadata.accountKey).toBeUndefined();
    expect(metadata.ipKey).toBeUndefined();
    expect(JSON.stringify(metadata)).toBe(
      '{"provider":"entra","reason":"invalid_credentials"}',
    );
  });

  it('uses the account pseudonym as the entity id and a constant marker otherwise', () => {
    const keyed = buildLoginFailedAuditMetadata({
      provider: 'local',
      email,
      ipAddress: ip,
      hmacSecret: secret,
    });
    expect(loginFailedEntityId(keyed)).toBe(keyed.accountKey);
    expect(loginFailedEntityId({ provider: 'local', reason: 'invalid_credentials' })).toBe(
      'anonymous',
    );
  });

  it('pins the action and the dedicated entity type', () => {
    expect(loginFailedAudit.action).toBe(auditLogActions.authLoginFailed);
    expect(loginFailedAudit.action).toBe('auth.login_failed');
    expect(loginFailedAudit.entityType).toBe(auditLogEntityTypes.authEvent);
    expect(loginFailedAudit.entityType).toBe('auth_event');
  });
});
