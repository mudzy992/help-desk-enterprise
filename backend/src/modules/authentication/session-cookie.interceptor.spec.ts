import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { SessionCookieInterceptor } from './session-cookie.interceptor';

const SYNTHETIC_TOKEN = 'synthetic-session-token-test-only';

function run(body: unknown) {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(body) };
  const result = lastValueFrom(new SessionCookieInterceptor().intercept(context, next));
  return { result, setHeader };
}

describe('SessionCookieInterceptor', () => {
  it('moves the access token into a Set-Cookie header and keeps the lifetime in the body', async () => {
    const { result, setHeader } = run({
      accessToken: SYNTHETIC_TOKEN,
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      principal: { subjectId: 'user-1' },
    });
    await expect(result).resolves.toEqual({
      expiresInSeconds: 3600,
      principal: { subjectId: 'user-1' },
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining(`${SESSION_COOKIE_NAME}=${SYNTHETIC_TOKEN}; Path=/; Max-Age=3600`),
    );
  });

  it('keeps other response fields such as recovery codes', async () => {
    const { result } = run({
      accessToken: SYNTHETIC_TOKEN,
      expiresInSeconds: 60,
      principal: { subjectId: 'user-1' },
      recoveryCodes: ['code-a'],
    });
    await expect(result).resolves.toMatchObject({ recoveryCodes: ['code-a'] });
  });

  it('leaves non-session bodies and cookies untouched', async () => {
    const { result, setHeader } = run({
      status: 'MFA_REQUIRED',
      mfaToken: 'pending-token',
    });
    await expect(result).resolves.toEqual({
      status: 'MFA_REQUIRED',
      mfaToken: 'pending-token',
    });
    expect(setHeader).not.toHaveBeenCalled();
  });
});
