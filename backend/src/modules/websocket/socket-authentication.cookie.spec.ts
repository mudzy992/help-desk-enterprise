import { Test } from '@nestjs/testing';
import { SESSION_COOKIE_NAME } from '../authentication/session-cookie';
import { SocketAuthenticationService } from './socket-authentication.service';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';

const APP_ORIGIN = 'https://desk.example.com';
const SYNTHETIC_TOKEN = 'synthetic-session-token-test-only';

describe('SocketAuthenticationService with the session cookie', () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const verify = jest.fn(async (credentials: { token: string }) => ({
    status: 'authenticated' as const,
    principal: { subjectId: `subject-of-${credentials.token}` },
  }));

  async function createService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SocketAuthenticationService,
        { provide: SOCKET_AUTHENTICATION_VERIFIER, useValue: { verify } },
      ],
    }).compile();
    return moduleRef.get(SocketAuthenticationService);
  }

  beforeEach(() => {
    process.env.CORS_ORIGIN = APP_ORIGIN;
    verify.mockClear();
  });

  afterAll(() => {
    if (originalCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = originalCorsOrigin;
    }
  });

  it('authenticates the browser from its session cookie when the origin is allowed', async () => {
    const service = await createService();
    const result = await service.authenticate(undefined, {
      cookie: `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}`,
      origin: APP_ORIGIN,
    });
    expect(verify).toHaveBeenCalledWith({ token: SYNTHETIC_TOKEN });
    expect(result.status).toBe('authenticated');
  });

  it('refuses a cookie handshake from a foreign origin without verifying it', async () => {
    const service = await createService();
    const result = await service.authenticate(undefined, {
      cookie: `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}`,
      origin: 'https://evil.example',
    });
    expect(verify).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'unauthenticated',
      reason: 'invalid_credentials',
    });
  });

  it('prefers an explicit auth token over the cookie', async () => {
    const service = await createService();
    await service.authenticate(
      { token: 'explicit-token-test-only' },
      {
        cookie: `${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}`,
        origin: 'https://evil.example',
      },
    );
    expect(verify).toHaveBeenCalledWith({ token: 'explicit-token-test-only' });
  });
});
