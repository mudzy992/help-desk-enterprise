import { UnauthorizedException } from '@nestjs/common';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  PRINCIPAL_CONTEXT_REQUEST_KEY,
} from './authenticated-request';
import { AuthenticationError } from './authentication.error';
import { SessionAuthenticationGuard } from './session-authentication.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Phase 2.2: the guard reads the caller through `PrincipalContextLoader` (one
 * load, Redis → database) instead of the authentication user loader, so this
 * fake stands in for that loader. The assertions below are unchanged.
 */
const principal: PrincipalContext = {
  subjectId: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isActive: true,
  isLocalOnly: false,
  mustChangePassword: false,
  entraObjectId: 'entra-object-1',
  roleKeys: ['AGENT'],
  groupIds: ['group-it'],
  homeOrganizationalUnitId: 'ou-it',
  assignments: [],
  authzVersion: 0,
};

function createContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('SessionAuthenticationGuard', () => {
  const verify = jest.fn();
  const load = jest.fn();
  const guard = new SessionAuthenticationGuard(
    { verify } as never,
    { load } as never,
  );

  beforeEach(() => {
    verify.mockReset();
    load.mockReset();
    verify.mockResolvedValue({ subjectId: 'user-1' });
    load.mockResolvedValue(principal);
  });

  it('rejects a missing bearer token', async () => {
    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects inactive users and broken SuperAdmin identities', async () => {
    load.mockResolvedValue({ ...principal, isActive: false });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer session-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    load.mockResolvedValue({
      ...principal,
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
    // Phase 2.2: the full context rides along for the guards that run after
    // this one — they must not load the same record again.
    expect(request[PRINCIPAL_CONTEXT_REQUEST_KEY]).toBe(principal);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('rejects a caller whose cached context says the password must change', async () => {
    load.mockResolvedValue({ ...principal, mustChangePassword: true });
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer session-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a caller the loader cannot find at all', async () => {
    load.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer session-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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
