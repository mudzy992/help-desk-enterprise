import { ForbiddenException } from '@nestjs/common';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { SessionAuthenticationGuard } from './session-authentication.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const APP_ORIGIN = 'https://desk.example.com';
const SYNTHETIC_TOKEN = 'synthetic-session-token-test-only';

const principal: PrincipalContext = {
  subjectId: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isActive: true,
  isLocalOnly: false,
  mustChangePassword: false,
  entraObjectId: 'entra-object-1',
  roleKeys: ['AGENT'],
  groupIds: [],
  homeOrganizationalUnitId: 'ou-it',
  assignments: [],
  authzVersion: 0,
};

function createContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('SessionAuthenticationGuard with the session cookie', () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const verify = jest.fn();
  const load = jest.fn();
  const guard = new SessionAuthenticationGuard({ verify } as never, { load } as never);

  beforeEach(() => {
    process.env.CORS_ORIGIN = APP_ORIGIN;
    verify.mockReset().mockResolvedValue({ subjectId: 'user-1' });
    load.mockReset().mockResolvedValue(principal);
  });

  afterAll(() => {
    if (originalCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = originalCorsOrigin;
    }
  });

  const cookieHeader = `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}`;

  it('accepts a cookie session on a safe read without an Origin header', async () => {
    await expect(
      guard.canActivate(createContext({ method: 'GET', headers: { cookie: cookieHeader } })),
    ).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith(SYNTHETIC_TOKEN);
  });

  it('accepts a state-changing cookie request from an allowed origin', async () => {
    await expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          headers: { cookie: cookieHeader, origin: APP_ORIGIN },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a state-changing cookie request from a foreign origin', async () => {
    await expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          headers: { cookie: cookieHeader, origin: 'https://evil.example' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects a state-changing cookie request without an Origin header', async () => {
    await expect(
      guard.canActivate(createContext({ method: 'DELETE', headers: { cookie: cookieHeader } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not apply the origin check to bearer callers', async () => {
    await expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          headers: { authorization: `Bearer ${SYNTHETIC_TOKEN}` },
        }),
      ),
    ).resolves.toBe(true);
  });
});
