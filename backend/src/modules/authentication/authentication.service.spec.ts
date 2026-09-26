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
  const createSession = jest.fn();
  const updateUser = jest.fn();
  const service = new AuthenticationService(
    { resolve } as never,
    { issue, issuePasswordChangeToken, issueMfaToken, verify: jest.fn() } as never,
    { findById } as never,
    { user: { update: updateUser } } as never,
    { load: async () => defaultAccountSecurityPolicy } as never,
    { requirementFor, isEnabled } as never,
    { create: createSession } as never,
    {} as never,
    { audit: jest.fn(), notify: jest.fn() } as never,
    { guard: (_key: string, run: () => Promise<unknown>) => run() } as never,
  );

  beforeEach(() => {
    resolve.mockReset();
    authenticate.mockReset();
    issue.mockReset();
    issuePasswordChangeToken.mockReset();
    findById.mockReset();
    resolve.mockResolvedValue({ authenticate });
    findById.mockResolvedValue(activeUser);
    issueMfaToken.mockReset().mockResolvedValue('mfa.jwt');
    requirementFor.mockReset().mockReturnValue('optional');
    isEnabled.mockReset().mockResolvedValue(false);
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
    expect(issue).toHaveBeenCalledWith(principal, 'session-1');
  });

  it('asks for the second factor when MFA is enabled', async () => {
    authenticate.mockResolvedValue(principal);
    isEnabled.mockResolvedValue(true);
    const response = await service.loginWithPassword({ email: 'agent@example.com', password: 'x' });
    expect(response).toEqual({
      status: 'MFA_REQUIRED',
      mfaToken: 'mfa.jwt',
      expiresInSeconds: authenticationConstants.mfaTokenTtlSeconds,
    });
    expect(issueMfaToken).toHaveBeenCalledWith('user-1', 'verify');
    expect(issue).not.toHaveBeenCalled();
  });

  it('forces enrollment when MFA is required but not set up', async () => {
    authenticate.mockResolvedValue(principal);
    requirementFor.mockReturnValue('required');
    const response = await service.loginWithPassword({ email: 'agent@example.com', password: 'x' });
    expect(response).toMatchObject({ status: 'MFA_ENROLLMENT_REQUIRED' });
    expect(issueMfaToken).toHaveBeenCalledWith('user-1', 'enroll');
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
    const response = await service.loginWithPassword({
      email: 'agent@example.com',
      password: 'temporary-password',
    });
    expect(response).toEqual({
      status: 'MUST_CHANGE_PASSWORD',
      passwordChangeToken: 'pwd-change.jwt',
      expiresInSeconds: authenticationConstants.passwordChangeTokenTtlSeconds,
      reason: 'temporary',
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
});
