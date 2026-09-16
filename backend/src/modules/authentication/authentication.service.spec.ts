import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';
import { AuthenticationService } from './authentication.service';
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
  const service = new AuthenticationService(
    { resolve } as never,
    { issue, issuePasswordChangeToken, verify: jest.fn() } as never,
    { findById } as never,
    {} as never,
  );

  beforeEach(() => {
    resolve.mockReset();
    authenticate.mockReset();
    issue.mockReset();
    issuePasswordChangeToken.mockReset();
    findById.mockReset();
    resolve.mockResolvedValue({ authenticate });
    findById.mockResolvedValue(activeUser);
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
