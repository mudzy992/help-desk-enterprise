import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { AuthenticationError } from './authentication.error';
import { HttpRequestExceptionFilter } from '../../common/request-context/http-exception.filter';
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

/*
  BA-authentication-09 (W2.16): every 401 from this guard ends the browser
  session, so the HttpOnly cookie is dropped in the same response. Assertions
  inspect the header the guard writes; the exception filter only adds the
  request id, so nothing overwrites it afterwards.
*/
describe('SessionAuthenticationGuard clears the dead session cookie', () => {
  const verify = jest.fn();
  const load = jest.fn();
  const guard = new SessionAuthenticationGuard({ verify } as never, { load } as never);

  beforeEach(() => {
    verify.mockReset().mockResolvedValue({ subjectId: 'user-1' });
    load.mockReset().mockResolvedValue(principal);
  });

  function createContextWithResponse(request: Record<string, unknown>, headers: Record<string, string>) {
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as never;
  }

  const cookieHeader = `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}`;

  it('drops the cookie when the account behind it is no longer active', async () => {
    load.mockResolvedValue({ ...principal, isActive: false });
    const headers: Record<string, string> = {};

    await expect(
      guard.canActivate(
        createContextWithResponse({ method: 'GET', headers: { cookie: cookieHeader } }, headers),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(headers['Set-Cookie']).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(headers['Set-Cookie']).toContain('Max-Age=0');
  });

  it('drops the cookie when the session token no longer verifies', async () => {
    verify.mockRejectedValue(new AuthenticationError('ACCOUNT_DISABLED'));
    const headers: Record<string, string> = {};

    await expect(
      guard.canActivate(
        createContextWithResponse({ method: 'GET', headers: { cookie: cookieHeader } }, headers),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(headers['Set-Cookie']).toContain('Max-Age=0');
  });

  it('leaves a bearer caller alone, because it holds no ambient cookie', async () => {
    load.mockResolvedValue({ ...principal, isActive: false });
    const headers: Record<string, string> = {};

    await expect(
      guard.canActivate(
        createContextWithResponse(
          { method: 'GET', headers: { authorization: `Bearer ${SYNTHETIC_TOKEN}` } },
          headers,
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(headers['Set-Cookie']).toBeUndefined();
  });

  it('does not clear the cookie on the origin refusal, where the session is still valid', async () => {
    const headers: Record<string, string> = {};

    await expect(
      guard.canActivate(
        createContextWithResponse(
          {
            method: 'POST',
            headers: { cookie: cookieHeader, origin: 'https://app.desk.example.com.evil.test' },
          },
          headers,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(headers['Set-Cookie']).toBeUndefined();
  });

  it('does not clear the cookie on a successful request', async () => {
    const headers: Record<string, string> = {};

    await expect(
      guard.canActivate(
        createContextWithResponse({ method: 'GET', headers: { cookie: cookieHeader } }, headers),
      ),
    ).resolves.toBe(true);

    expect(headers['Set-Cookie']).toBeUndefined();
  });

  /*
    The unit assertions above only prove what the guard writes. This one runs the
    real exception filter over the same response object, because that is the last
    place a header could be dropped before the browser sees it.
  */
  it('keeps the header through the HTTP exception filter', async () => {
    load.mockResolvedValue({ ...principal, isActive: false });
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      status: () => ({ json: () => undefined }),
    };
    const request = { method: 'GET', headers: { cookie: cookieHeader } };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as never;

    const error = await guard
      .canActivate(host)
      .then(() => null)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnauthorizedException);
    new HttpRequestExceptionFilter().catch(error, host);

    expect(headers['Set-Cookie']).toContain('helpdesk_session=;');
    expect(headers['Set-Cookie']).toContain('Max-Age=0');
  });
});
