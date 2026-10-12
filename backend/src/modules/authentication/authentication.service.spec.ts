import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';
import { AuthenticationService } from './authentication.service';
import { AccountSecurityError } from './security/account-security.error';
import { defaultAccountSecurityPolicy } from './security/account-security-policy.loader';
import { passkeyLoginChallengeKey } from './security/passkey-credential.service';
import type {
  AuthenticatedPrincipal,
  AuthenticationUserRecord,
  MfaTokenClaims,
} from './authentication.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const principal: AuthenticatedPrincipal = {
  subjectId: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isLocalOnly: false,
};

const activeUser: AuthenticationUserRecord = {
  id: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isActive: true,
  isLocalOnly: false,
  mustChangePassword: false,
  localPasswordHash: '$2b$04$hash',
  entraObjectId: null,
  roleKeys: ['AGENT'],
};

describe('AuthenticationService', () => {
  const resolve = jest.fn();
  const authenticate = jest.fn();
  const issue = jest.fn();
  const issuePasswordChangeToken = jest.fn();
  const findById = jest.fn();
  const issueMfaToken = jest.fn();
  const requirementFor = jest.fn();
  const isEnabled = jest.fn();
  const flowFor = jest.fn();
  const createSession = jest.fn();
  const updateUser = jest.fn();
  const loadPolicy = jest.fn();
  const service = new AuthenticationService(
    { resolve } as never,
    { issue, issuePasswordChangeToken, issueMfaToken, verify: jest.fn() } as never,
    { findById } as never,
    { user: { update: updateUser } } as never,
    { load: loadPolicy } as never,
    { requirementFor, isEnabled, flowFor } as never,
    { create: createSession } as never,
    {} as never,
    // Paket 5.4.0-a: passkey factor — the spec only exercises TOTP flows, so a
    // counting stub keeps the `methods` computation honest without WebAuthn.
    { countCredentials: jest.fn().mockResolvedValue(0) } as never,
    { load: () => null } as never,
    { audit: jest.fn(), notify: jest.fn() } as never,
    { guard: (_key: string, run: () => Promise<unknown>) => run() } as never,
    { record: jest.fn(async () => undefined) } as never,
  );

  beforeEach(() => {
    resolve.mockReset();
    authenticate.mockReset();
    issue.mockReset();
    issuePasswordChangeToken.mockReset();
    findById.mockReset();
    resolve.mockResolvedValue({ authenticate });
    loadPolicy.mockReset().mockResolvedValue(defaultAccountSecurityPolicy);
    findById.mockResolvedValue(activeUser);
    issueMfaToken.mockReset().mockResolvedValue('mfa.jwt');
    requirementFor.mockReset().mockReturnValue('optional');
    isEnabled.mockReset().mockResolvedValue(false);
    // Paket 5.1 (M2 #1): mirrors the real decision — an enrolled factor is
    // always verified, otherwise the requirement decides enrolment.
    flowFor
      .mockReset()
      .mockImplementation((_subject: unknown, _policy: unknown, enrolled: boolean) =>
        enrolled ? 'verify' : requirementFor() === 'required' ? 'enroll' : 'none',
      );
    createSession.mockReset().mockResolvedValue({ id: 'session-1' });
    updateUser.mockReset().mockResolvedValue({});
  });

  it('binds the issued token to a registry session (sid)', async () => {
    authenticate.mockResolvedValue(principal);
    issue.mockResolvedValue('signed.jwt.token');
    await service.loginWithPassword({ email: 'agent@example.com', password: 'x' }, { ipAddress: '10.0.0.5', userAgent: 'UA' });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', provider: 'local', mfaMethod: null }),
    );
    expect(issue).toHaveBeenCalledWith(principal, 'session-1', {
      ttlSeconds: authenticationConstants.sessionTtlSeconds,
      rememberMe: false,
    });
  });

  it('asks for the second factor when MFA is enabled', async () => {
    authenticate.mockResolvedValue(principal);
    isEnabled.mockResolvedValue(true);
    const response = await service.loginWithPassword({ email: 'agent@example.com', password: 'x' });
    expect(response).toEqual({
      status: 'MFA_REQUIRED',
      mfaToken: 'mfa.jwt',
      expiresInSeconds: authenticationConstants.mfaTokenTtlSeconds,
      // Paket 5.4.0-a: the passkey stub reports zero credentials, so TOTP only.
      methods: ['totp'],
    });
    expect(issueMfaToken).toHaveBeenCalledWith('user-1', 'verify', false);
    expect(issue).not.toHaveBeenCalled();
  });

  // Paket 5.1 (M2 #1): `allowOptional: false` used to skip the prompt for
  // accounts that already carried the factor (requirement 'unavailable').
  it('still asks for the second factor when optional enrolment is off but the factor is enrolled', async () => {
    authenticate.mockResolvedValue(principal);
    requirementFor.mockReturnValue('unavailable');
    isEnabled.mockResolvedValue(true);
    const response = await service.loginWithPassword({ email: 'agent@example.com', password: 'x' });
    expect(response).toMatchObject({ status: 'MFA_REQUIRED' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('forces enrollment when MFA is required but not set up', async () => {
    authenticate.mockResolvedValue(principal);
    requirementFor.mockReturnValue('required');
    const response = await service.loginWithPassword({ email: 'agent@example.com', password: 'x' });
    expect(response).toMatchObject({ status: 'MFA_ENROLLMENT_REQUIRED' });
    expect(issueMfaToken).toHaveBeenCalledWith('user-1', 'enroll', false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('turns an expired password into a forced change', async () => {
    authenticate.mockResolvedValue(principal);
    findById.mockResolvedValue({
      ...activeUser,
      roleKeys: ['SUPER_ADMIN'],
      passwordChangedAt: new Date(Date.now() - 400 * 86_400_000),
    });
    issuePasswordChangeToken.mockResolvedValue('pwd-change.jwt');
    const response = await service.loginWithPassword({ email: 'agent@example.com', password: 'x' });
    expect(response).toMatchObject({ status: 'MUST_CHANGE_PASSWORD', reason: 'expired' });
    expect(updateUser).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { mustChangePassword: true } });
  });

  it('never asks Entra sign-ins for a second factor', async () => {
    authenticate.mockResolvedValue(principal);
    requirementFor.mockReturnValue('required');
    issue.mockResolvedValue('signed.jwt.token');
    await service.loginWithEntraIdToken('signed.entra.id-token');
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ provider: 'entra' }));
  });

  it('issues a session token for a normalized principal', async () => {
    authenticate.mockResolvedValue(principal);
    issue.mockResolvedValue('signed.jwt.token');
    const session = await service.loginWithPassword({
      email: 'agent@example.com',
      password: 'correct-horse-battery',
    });
    expect(session).toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresInSeconds: authenticationConstants.sessionTtlSeconds,
      principal,
    });
    expect(session).not.toHaveProperty('status');
    expect(JSON.stringify(session)).not.toContain('correct-horse-battery');
  });

  it('returns must-change-password without a session token', async () => {
    authenticate.mockResolvedValue(principal);
    findById.mockResolvedValue({
      ...activeUser,
      mustChangePassword: true,
    });
    issuePasswordChangeToken.mockResolvedValue('pwd-change.jwt');
    loadPolicy.mockResolvedValue({ ...defaultAccountSecurityPolicy, passwordMinLength: 20 });
    const response = await service.loginWithPassword({
      email: 'agent@example.com',
      password: 'temporary-password',
    });
    expect(response).toEqual({
      status: 'MUST_CHANGE_PASSWORD',
      passwordChangeToken: 'pwd-change.jwt',
      expiresInSeconds: authenticationConstants.passwordChangeTokenTtlSeconds,
      reason: 'temporary',
      // Paket 5.1 (M2 #2): the screen gets the number, not a hard-coded 12.
      passwordMinLength: 20,
    });
    expect(issue).not.toHaveBeenCalled();
  });

  it('maps invalid credentials to a generic unauthorized response', async () => {
    authenticate.mockRejectedValue(
      new AuthenticationError('INVALID_CREDENTIALS'),
    );
    await expect(
      service.loginWithPassword({
        email: 'agent@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when the authentication mode is unsupported', async () => {
    resolve.mockRejectedValue(
      new AuthenticationError('UNSUPPORTED_AUTHENTICATION_MODE'),
    );
    await expect(
      service.loginWithPassword({
        email: 'agent@example.com',
        password: 'correct-horse-battery',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('issues the same session shape for a valid Entra ID token', async () => {
    authenticate.mockResolvedValue(principal);
    issue.mockResolvedValue('signed.jwt.token');
    const idToken = 'signed.entra.id-token';
    const session = await service.loginWithEntraIdToken(idToken);
    expect(session).toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresInSeconds: authenticationConstants.sessionTtlSeconds,
      principal,
    });
    expect(JSON.stringify(session)).not.toContain(idToken);
  });

  it('fails closed when Entra configuration is unavailable', async () => {
    authenticate.mockRejectedValue(
      new AuthenticationError('AUTHENTICATION_UNAVAILABLE'),
    );
    await expect(
      service.loginWithEntraIdToken('signed.entra.id-token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  describe('5.4.0-c remember me', () => {
    it('issues a 30-day registered session when requested', async () => {
      authenticate.mockResolvedValue(principal);
      issue.mockResolvedValue('remembered.jwt');

      const response = await service.loginWithPassword({
        email: 'agent@example.com',
        password: 'correct-horse-battery',
        rememberMe: true,
      });

      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: true }),
      );
      expect(issue).toHaveBeenCalledWith(principal, 'session-1', {
        ttlSeconds: authenticationConstants.rememberMeSessionTtlSeconds,
        rememberMe: true,
      });
      expect(response).toMatchObject({
        accessToken: 'remembered.jwt',
        expiresInSeconds:
          authenticationConstants.rememberMeSessionTtlSeconds,
      });
    });

    it('carries the choice into an MFA-required intermediate token', async () => {
      authenticate.mockResolvedValue(principal);
      isEnabled.mockResolvedValue(true);

      await expect(
        service.loginWithPassword({
          email: 'agent@example.com',
          password: 'correct-horse-battery',
          rememberMe: true,
        }),
      ).resolves.toMatchObject({ status: 'MFA_REQUIRED' });

      expect(issueMfaToken).toHaveBeenCalledWith(
        'user-1',
        'verify',
        true,
      );
    });

    it('ignores remember me for SUPER_ADMIN and always issues one hour', async () => {
      authenticate.mockResolvedValue(principal);
      findById.mockResolvedValue({
        ...activeUser,
        roleKeys: [authenticationConstants.superAdminRoleKey],
      });
      issue.mockResolvedValue('break-glass.jwt');

      const response = await service.loginWithPassword({
        email: 'agent@example.com',
        password: 'correct-horse-battery',
        rememberMe: true,
      });

      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: false }),
      );
      expect(issue).toHaveBeenCalledWith(principal, 'session-1', {
        ttlSeconds: authenticationConstants.sessionTtlSeconds,
        rememberMe: false,
      });
      expect(response).toMatchObject({
        expiresInSeconds: authenticationConstants.sessionTtlSeconds,
      });
    });

    it('keeps remember me off by default', async () => {
      authenticate.mockResolvedValue(principal);
      issue.mockResolvedValue('default.jwt');

      await service.loginWithPassword({
        email: 'agent@example.com',
        password: 'correct-horse-battery',
      });

      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: false }),
      );
      expect(issue).toHaveBeenCalledWith(principal, 'session-1', {
        ttlSeconds: authenticationConstants.sessionTtlSeconds,
        rememberMe: false,
      });
    });
  });
});

describe('AuthenticationService 5.4.0-c idle timeout on refresh', () => {
  const claims = (rememberMe = false) => ({
    subjectId: 'user-1',
    sessionId: 'session-1',
    jti: 'token-1',
    issuedAt: 1,
    expiresAt: 2,
    rememberMe,
  });

  function buildRefreshService(input: {
    readonly idleTimeoutSeconds: number;
    readonly session:
      | {
          readonly id: string;
          readonly userId: string;
          readonly lastSeenAt: Date;
          readonly rememberMe: boolean;
        }
      | null;
  }) {
    const issue = jest.fn().mockResolvedValue('refreshed.jwt');
    const revokeToken = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue({ id: 'legacy-session' });
    const findActive = jest.fn().mockResolvedValue(input.session);
    const touch = jest.fn().mockResolvedValue(undefined);
    const revokeSession = jest.fn().mockResolvedValue(true);
    const loadIdleTimeout = jest
      .fn()
      .mockResolvedValue(input.idleTimeoutSeconds);
    const service = new AuthenticationService(
      {} as never,
      { issue, revoke: revokeToken } as never,
      {} as never,
      {} as never,
      { load: jest.fn().mockResolvedValue(defaultAccountSecurityPolicy) } as never,
      {} as never,
      {
        create,
        findActive,
        touch,
        revoke: revokeSession,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { guard: (_key: string, run: () => Promise<unknown>) => run() } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { load: loadIdleTimeout } as never,
    );
    return {
      service,
      issue,
      revokeToken,
      create,
      findActive,
      touch,
      revokeSession,
      loadIdleTimeout,
    };
  }

  it('revokes the live session and returns 401 after the idle limit', async () => {
    const fixture = buildRefreshService({
      idleTimeoutSeconds: 300,
      session: {
        id: 'session-1',
        userId: 'user-1',
        lastSeenAt: new Date(Date.now() - 301_000),
        rememberMe: false,
      },
    });

    await expect(
      fixture.service.refresh(claims(), principal),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(fixture.revokeSession).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      reason: 'idle_timeout',
      actorUserId: null,
    });
    expect(fixture.touch).not.toHaveBeenCalled();
    expect(fixture.issue).not.toHaveBeenCalled();
  });

  it('refreshes and touches a session that is still inside the idle window', async () => {
    const fixture = buildRefreshService({
      idleTimeoutSeconds: 300,
      session: {
        id: 'session-1',
        userId: 'user-1',
        lastSeenAt: new Date(Date.now() - 299_000),
        rememberMe: false,
      },
    });

    await expect(fixture.service.refresh(claims(), principal)).resolves.toMatchObject({
      accessToken: 'refreshed.jwt',
      expiresInSeconds: authenticationConstants.sessionTtlSeconds,
    });
    expect(fixture.touch).toHaveBeenCalledWith(
      'session-1',
      { ipAddress: null, userAgent: null },
      false,
    );
    expect(fixture.revokeSession).not.toHaveBeenCalled();
    expect(fixture.revokeToken).toHaveBeenCalledWith(claims());
  });

  it('skips idle enforcement when zero disables the policy', async () => {
    const fixture = buildRefreshService({
      idleTimeoutSeconds: 0,
      session: {
        id: 'session-1',
        userId: 'user-1',
        lastSeenAt: new Date(0),
        rememberMe: false,
      },
    });

    await expect(fixture.service.refresh(claims(), principal)).resolves.toMatchObject({
      expiresInSeconds: authenticationConstants.sessionTtlSeconds,
    });
    expect(fixture.revokeSession).not.toHaveBeenCalled();
    expect(fixture.touch).toHaveBeenCalled();
  });

  it('keeps the 30-day TTL while refreshing a remembered session', async () => {
    const fixture = buildRefreshService({
      idleTimeoutSeconds: 0,
      session: {
        id: 'session-1',
        userId: 'user-1',
        lastSeenAt: new Date(),
        rememberMe: true,
      },
    });

    await expect(fixture.service.refresh(claims(), principal)).resolves.toMatchObject({
      expiresInSeconds: authenticationConstants.rememberMeSessionTtlSeconds,
    });
    expect(fixture.touch).toHaveBeenCalledWith(
      'session-1',
      { ipAddress: null, userAgent: null },
      true,
    );
    expect(fixture.issue).toHaveBeenCalledWith(principal, 'session-1', {
      ttlSeconds: authenticationConstants.rememberMeSessionTtlSeconds,
      rememberMe: true,
    });
  });

  it('does not revoke when there is no live registry row', async () => {
    const fixture = buildRefreshService({
      idleTimeoutSeconds: 300,
      session: null,
    });

    await expect(
      fixture.service.refresh(claims(true), principal),
    ).resolves.toMatchObject({
      expiresInSeconds: authenticationConstants.rememberMeSessionTtlSeconds,
    });
    expect(fixture.revokeSession).not.toHaveBeenCalled();
    expect(fixture.touch).toHaveBeenCalledWith(
      'session-1',
      { ipAddress: null, userAgent: null },
      true,
    );
  });
});

/*
  Paket 5.4.0-d (M6): `auth.login_failed` is written for a real credential
  rejection and for nothing else. The assertions inspect the **stored row**, so
  they double as the privacy proof the design asks for: no raw e-mail, no raw
  IP, no password, no token.
*/
describe('AuthenticationService auth.login_failed', () => {
  type AuditRow = Record<string, unknown>;

  function buildFixture(options: {
    readonly authenticate: jest.Mock;
    readonly secret?: string | null;
    readonly failSecretLoad?: boolean;
    readonly failAudit?: boolean;
  }) {
    const rows: AuditRow[] = [];
    const auditClient = {
      $executeRaw: jest.fn(async () => 1),
      auditLog: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: AuditRow }) => {
          rows.push(data);
          return data;
        }),
      },
    };
    const prisma = options.failAudit
      ? {
          $transaction: async () => {
            throw new Error('audit database down');
          },
        }
      : {
          $transaction: async (run: (client: unknown) => Promise<unknown>) =>
            run(auditClient),
        };
    const secretLoader =
      options.failSecretLoad === true
        ? {
            load: async () => {
              throw new Error('no signing secret');
            },
          }
        : { load: async () => options.secret ?? null };
    const service = new AuthenticationService(
      { resolve: async () => ({ authenticate: options.authenticate }) } as never,
      { issue: jest.fn(async () => 'signed.jwt.token'), verify: jest.fn() } as never,
      { findById: jest.fn(async () => ({ ...activeUser, isLocalOnly: true })) } as never,
      prisma as never,
      { load: jest.fn(async () => defaultAccountSecurityPolicy) } as never,
      {
        requirementFor: jest.fn(() => 'optional'),
        isEnabled: jest.fn(async () => false),
        flowFor: jest.fn(() => 'none'),
      } as never,
      { create: jest.fn(async () => ({ id: 'session-1' })) } as never,
      {} as never,
      { countCredentials: jest.fn(async () => 0) } as never,
      { load: () => null } as never,
      { audit: jest.fn(), notify: jest.fn() } as never,
      { guard: (_key: string, run: () => Promise<unknown>) => run() } as never,
      { record: jest.fn(async () => undefined) } as never,
      { load: () => null } as never,
      secretLoader as never,
    );
    return { service, rows, auditClient };
  }

  const email = 'Ana.Anic@Example.com';
  const ipAddress = '203.0.113.77';
  const context = { ipAddress, userAgent: 'UA' };

  it('stores one pseudonymous entry for a rejected local password and keeps the generic answer', async () => {
    const authenticate = jest.fn().mockRejectedValue(new AuthenticationError('INVALID_CREDENTIALS'));
    const { service, rows } = buildFixture({ authenticate, secret: 'unit-secret' });

    await expect(
      service.loginWithPassword({ email, password: 'wrong-password' }, context),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS', message: 'Authentication failed' },
    });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.action).toBe('auth.login_failed');
    expect(row.entityType).toBe('auth_event');
    expect(row.actorUserId).toBeNull();
    expect(row.metadata).toMatchObject({ provider: 'local', reason: 'invalid_credentials' });
    expect(typeof row.entityId).toBe('string');
    expect(row.entityId).not.toBe('anonymous');

    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('ana.anic');
    expect(serialized).not.toContain('Ana.Anic');
    expect(serialized).not.toContain('Example.com');
    expect(serialized).not.toContain(ipAddress);
    expect(serialized).not.toContain('203.0.113');
    expect(serialized).not.toContain('wrong-password');
    expect(serialized).toContain('invalid_credentials');
  });

  it('records the Entra provider for a rejected federated token', async () => {
    const authenticate = jest.fn().mockRejectedValue(new AuthenticationError('INVALID_CREDENTIALS'));
    const { service, rows } = buildFixture({ authenticate, secret: 'unit-secret' });

    await expect(
      service.loginWithEntraIdToken('a.b.c', { ipAddress, userAgent: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toMatchObject({ provider: 'entra', reason: 'invalid_credentials' });
    expect(JSON.stringify(rows[0])).not.toContain('a.b.c');
  });

  it('writes nothing after a successful sign-in', async () => {
    const authenticate = jest.fn().mockResolvedValue(principal);
    const { service, rows } = buildFixture({ authenticate, secret: 'unit-secret' });

    const response = await service.loginWithPassword(
      { email, password: 'right-password' },
      context,
    );

    expect(rows).toHaveLength(0);
    expect(response).toMatchObject({ accessToken: 'signed.jwt.token' });
  });

  it('writes nothing for a validation or invariant failure that is not a credential rejection', async () => {
    const authenticate = jest.fn().mockRejectedValue(
      new AuthenticationError('SUPER_ADMIN_MUST_BE_LOCAL_ONLY'),
    );
    const { service, rows } = buildFixture({ authenticate, secret: 'unit-secret' });

    await expect(service.loginWithPassword({ email, password: 'x' }, context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(rows).toHaveLength(0);
  });

  it('keeps the authentication answer when the audit write fails', async () => {
    const authenticate = jest.fn().mockRejectedValue(new AuthenticationError('INVALID_CREDENTIALS'));
    const { service, auditClient } = buildFixture({
      authenticate,
      secret: 'unit-secret',
      failAudit: true,
    });

    await expect(
      service.loginWithPassword({ email, password: 'wrong-password' }, context),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    expect(auditClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('omits the pseudonyms instead of writing an unkeyed digest when no key is available', async () => {
    const authenticate = jest.fn().mockRejectedValue(new AuthenticationError('INVALID_CREDENTIALS'));
    const { service, rows } = buildFixture({ authenticate, failSecretLoad: true });

    await expect(
      service.loginWithPassword({ email, password: 'wrong-password' }, context),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toEqual({ provider: 'local', reason: 'invalid_credentials' });
    expect(rows[0]!.entityId).toBe('anonymous');
    expect(JSON.stringify(rows[0])).not.toContain('ana.anic');
    expect(JSON.stringify(rows[0])).not.toContain(ipAddress);
  });
});

/*
  Paket 5.4.0-f: the passkey second factor at sign-in.

  The browser ceremonies and the WebAuthn verification itself live in
  `security/passkey-credential.service.spec.ts`; what this block pins down is the
  **sign-in decision**: which factors the screen may offer, that the challenge is
  bound to the mfa token (never to the account alone, so two parallel sign-ins
  cannot interfere), that an accepted assertion issues a session with
  `mfaMethod: 'passkey'`, that a refused one is a 401 `MFA_INVALID_CODE` which
  does **not** consume the mfa token, and that break-glass (SUPER_ADMIN) keeps
  its one-hour TTL on this path exactly like on the TOTP path.
*/
describe('AuthenticationService 5.4.0-a passkey second factor', () => {
  // Typed as the real claims: a test may ask for the `enroll` stage, and the
  // server has to refuse that token on the login path (CI compiles the specs).
  const mfaClaims = (rememberMe = false): MfaTokenClaims => ({
    subjectId: 'user-1',
    stage: 'verify',
    jti: 'mfa-jti-1',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    rememberMe,
  });

  function buildPasskeyService(overrides: {
    readonly user?: AuthenticationUserRecord;
    readonly claims?: ReturnType<typeof mfaClaims>;
    readonly passkeys?: number;
    readonly totpEnrolled?: boolean;
    readonly verifyAssertion?: jest.Mock;
  } = {}) {
    const authenticate = jest.fn().mockResolvedValue(principal);
    const issue = jest.fn().mockResolvedValue('passkey.jwt');
    const issueMfaToken = jest.fn().mockResolvedValue('mfa.jwt');
    const verifyMfaToken = jest.fn().mockResolvedValue(overrides.claims ?? mfaClaims());
    const consumeMfaToken = jest.fn().mockResolvedValue(undefined);
    const createSession = jest.fn().mockResolvedValue({ id: 'session-1' });
    const countCredentials = jest.fn().mockResolvedValue(overrides.passkeys ?? 1);
    const startAuthentication = jest.fn().mockResolvedValue({ options: { challenge: 'challenge-1' } });
    const verifyAssertion = overrides.verifyAssertion ?? jest.fn().mockResolvedValue({ credentialRowId: 'row-1' });
    const guard = jest.fn((_key: string, run: () => Promise<unknown>) => run());
    const user = overrides.user ?? activeUser;
    const service = new AuthenticationService(
      { resolve: jest.fn().mockResolvedValue({ authenticate }) } as never,
      { issue, issuePasswordChangeToken: jest.fn(), issueMfaToken, verifyMfaToken, consumeMfaToken } as never,
      { findById: jest.fn().mockResolvedValue(user) } as never,
      { user: { update: jest.fn() } } as never,
      { load: jest.fn().mockResolvedValue(defaultAccountSecurityPolicy) } as never,
      {
        requirementFor: jest.fn().mockReturnValue('required'),
        isEnabled: jest.fn().mockResolvedValue(overrides.totpEnrolled ?? false),
        flowFor: jest.fn().mockReturnValue('verify'),
        verify: jest.fn(),
      } as never,
      { create: createSession } as never,
      {} as never,
      { countCredentials, startAuthentication, verifyAssertion } as never,
      { load: jest.fn().mockReturnValue({ rpID: 'localhost', rpName: 'Help Desk', expectedOrigins: ['http://localhost:5173'] }) } as never,
      { audit: jest.fn(), notify: jest.fn() } as never,
      { guard } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );
    return {
      service,
      authenticate,
      issue,
      consumeMfaToken,
      createSession,
      countCredentials,
      startAuthentication,
      verifyAssertion,
      guard,
    };
  }

  it('offers the factors the account really has, passkey included', async () => {
    const { service, countCredentials } = buildPasskeyService({ passkeys: 2, totpEnrolled: true });

    await expect(
      service.loginWithPassword({ email: 'agent@example.com', password: 'correct-horse-battery' }),
    ).resolves.toMatchObject({ status: 'MFA_REQUIRED', methods: ['totp', 'passkey'] });
    expect(countCredentials).toHaveBeenCalledWith('user-1');
  });

  it('binds the login challenge to the mfa token (jti), so parallel sign-ins never share one', async () => {
    const { service, startAuthentication } = buildPasskeyService();

    await expect(service.startMfaPasskey('mfa.jwt')).resolves.toEqual({
      options: { challenge: 'challenge-1' },
    });
    expect(startAuthentication).toHaveBeenCalledWith(
      'user-1',
      passkeyLoginChallengeKey('mfa-jti-1'),
      expect.objectContaining({ rpID: 'localhost' }),
    );
  });

  it('refuses a token from the enrollment stage instead of starting a login ceremony', async () => {
    const { service, startAuthentication } = buildPasskeyService({ claims: { ...mfaClaims(), stage: 'enroll' } });

    await expect(service.startMfaPasskey('mfa.jwt')).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it('issues a session marked as passkey-verified and consumes the mfa token once', async () => {
    const { service, createSession, consumeMfaToken, verifyAssertion } = buildPasskeyService();

    const response = await service.verifyMfaPasskey(
      { mfaToken: 'mfa.jwt', assertion: { id: 'credential-1' } },
      { ipAddress: '10.0.0.9', userAgent: 'UA' },
    );

    expect(verifyAssertion).toHaveBeenCalledWith(
      'user-1',
      passkeyLoginChallengeKey('mfa-jti-1'),
      { id: 'credential-1' },
      expect.objectContaining({ rpID: 'localhost' }),
      // Login-time assertions do not demand UV: the authenticator decides, and
      // the platform check is the same one the QR/phone flow relies on.
      false,
      '10.0.0.9',
    );
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', provider: 'local', mfaMethod: 'passkey', rememberMe: false }),
    );
    expect(consumeMfaToken).toHaveBeenCalledWith(expect.objectContaining({ jti: 'mfa-jti-1' }));
    expect(response).toMatchObject({ accessToken: 'passkey.jwt', expiresInSeconds: authenticationConstants.sessionTtlSeconds });
  });

  it('answers a refused assertion with 401 MFA_INVALID_CODE and keeps the mfa token usable', async () => {
    const verifyAssertion = jest
      .fn()
      .mockRejectedValue(new AccountSecurityError('MFA_INVALID_CODE'));
    const { service, consumeMfaToken, createSession, guard } = buildPasskeyService({ verifyAssertion });

    await expect(
      service.verifyMfaPasskey({ mfaToken: 'mfa.jwt', assertion: { id: 'credential-1' } }),
    ).rejects.toMatchObject({ status: 401, response: { code: 'MFA_INVALID_CODE' } });

    // The bucket that guards MFA confirmations counted the failure, but nothing
    // was issued and the intermediate token was not burned — the person may try
    // the other factor or the same one again.
    expect(guard).toHaveBeenCalledWith('auth:mfa-fail:user-1', expect.any(Function));
    expect(consumeMfaToken).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('forces remember me off for a SUPER_ADMIN on the passkey path too', async () => {
    const { service, createSession, issue } = buildPasskeyService({
      user: { ...activeUser, roleKeys: [authenticationConstants.superAdminRoleKey] },
      claims: mfaClaims(true),
    });

    const response = await service.verifyMfaPasskey({ mfaToken: 'mfa.jwt', assertion: { id: 'credential-1' } });

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: false }));
    expect(issue).toHaveBeenCalledWith(expect.anything(), 'session-1', {
      ttlSeconds: authenticationConstants.sessionTtlSeconds,
      rememberMe: false,
    });
    expect(response.expiresInSeconds).toBe(authenticationConstants.sessionTtlSeconds);
  });
});
