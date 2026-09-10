import { UnauthorizedException } from '@nestjs/common';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from './authenticated-request';
import { AuthenticationError } from './authentication.error';
import { SessionAuthenticationGuard } from './session-authentication.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const user = {
  id: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isActive: true,
  isLocalOnly: false,
  localPasswordHash: null,
  entraObjectId: 'entra-object-1',
  roleKeys: ['AGENT'],
};

function createContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('SessionAuthenticationGuard', () => {
  const verify = jest.fn();
  const findById = jest.fn();
  const guard = new SessionAuthenticationGuard(
    { verify } as never,
    { findById } as never,
  );

  beforeEach(() => {
    verify.mockReset();
    findById.mockReset();
    verify.mockResolvedValue({ subjectId: 'user-1' });
    findById.mockResolvedValue(user);
  });

  it('rejects a missing bearer token', async () => {
    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects inactive users and broken SuperAdmin identities', async () => {
    findById.mockResolvedValue({ ...user, isActive: false });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer session-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    findById.mockResolvedValue({
      ...user,
      isLocalOnly: false,
      entraObjectId: 'entra-object-1',
      roleKeys: ['SUPER_ADMIN'],
    });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer session-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches a provider-neutral principal from the local user record', async () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer session-token' },
      body: { roles: ['SUPER_ADMIN'], oid: 'forged-oid' },
    };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY]).toEqual({
      subjectId: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      isLocalOnly: false,
    });
    expect(request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY]).not.toHaveProperty(
      'provider',
    );
    expect(request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY]).not.toHaveProperty(
      'entraObjectId',
    );
    expect(request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY]).not.toHaveProperty(
      'roles',
    );
  });

  it('does not echo the access token when verification fails', async () => {
    verify.mockRejectedValue(new AuthenticationError('INVALID_CREDENTIALS'));
    try {
      await guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer leaked-session-token' },
        }),
      );
      throw new Error('expected unauthorized');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(JSON.stringify(error)).not.toContain('leaked-session-token');
    }
  });
});
