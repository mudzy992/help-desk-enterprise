import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';
import { AuthenticationService } from './authentication.service';
import { defaultAccountSecurityPolicy } from './security/account-security-policy.loader';
import type {
  AuthenticatedPrincipal,
  AuthenticationUserRecord,
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
