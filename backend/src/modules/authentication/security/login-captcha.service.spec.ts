import { BadRequestException } from '@nestjs/common';
import {
  captchaAfterFailures,
  captchaTokenMaxLength,
  createCaptchaFailedException,
  createCaptchaRequiredException,
  LoginCaptchaService,
  turnstileSiteVerifyUrl,
} from './login-captcha.service';

/*
  Paket 5.4.1 (M3): Cloudflare Turnstile in front of the password sign-in.

  What is pinned here: the default provider changes nothing; the challenge is
  demanded from the failures threshold on; a token is either accepted or
  rejected by Cloudflare; and a Cloudflare that cannot be reached is fail-open
  for an ordinary attempt (the rate limiter still protects) and never silently
  becomes a "passed" verdict (the limiter keeps its 429).
*/
describe('LoginCaptchaService (5.4.1 M3)', () => {
  type FetchCall = { readonly url: string; readonly body: string };
  const settingsWith = (values: Record<string, unknown>) =>
    ({
      getSetting: async (key: string) => values[key],
      getSecretForInternalUse: async (key: string) => values[key],
    }) as never;

  const providerKey = 'private.security.captcha.provider';
  const siteKeyKey = 'private.security.captcha.siteKey';
  const secretKey = 'private.security.captcha.secretKey';

  function turnstileFixture(payload: unknown, ok = true, status = 200) {
    const calls: FetchCall[] = [];
    const metrics = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new LoginCaptchaService(
      settingsWith({
        [providerKey]: 'turnstile',
        [siteKeyKey]: ' 1x00000000000000000000AA ',
        [secretKey]: '1x0000000000000000000000000000000AA',
      }),
      metrics as never,
      async (url, init) => {
        calls.push({ url, body: init?.body ?? '' });
        return {
          ok,
          status,
          json: async () => payload,
        };
      },
    );
    return { service, calls, metrics };
  }

  it('is off by default: nothing is demanded and no call is made', async () => {
    const calls: FetchCall[] = [];
    const service = new LoginCaptchaService(
      settingsWith({}),
      undefined,
      async (url, init) => {
        calls.push({ url, body: init?.body ?? '' });
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      },
    );

    await expect(service.describe()).resolves.toEqual({
      provider: 'none',
      siteKey: null,
      afterFailures: captchaAfterFailures,
    });
    await expect(service.required(captchaAfterFailures + 10)).resolves.toBe(false);
    await expect(service.verify('any-token', '192.0.2.1')).resolves.toBe('not-required');
    expect(calls).toEqual([]);
  });

  it('an unreadable or unknown provider setting counts as none', async () => {
    const service = new LoginCaptchaService(
      {
        getSetting: async () => {
          throw new Error('settings database down');
        },
        getSecretForInternalUse: async () => {
          throw new Error('settings database down');
        },
      } as never,
      undefined,
      async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }),
    );
    await expect(service.required(captchaAfterFailures)).resolves.toBe(false);
    await expect(service.verify('token')).resolves.toBe('not-required');
  });

  it('describes the public half only — the site key is trimmed, the secret never leaves', async () => {
    const { service } = turnstileFixture({ success: true });
    const description = await service.describe();
    expect(description).toEqual({
      provider: 'turnstile',
      siteKey: '1x00000000000000000000AA',
      afterFailures: captchaAfterFailures,
    });
    expect(JSON.stringify(description)).not.toContain('1x0000000000000000000000000000000AA');
  });

  it('demands the challenge only from the failures threshold on', async () => {
    const { service } = turnstileFixture({ success: true });
    await expect(service.required(captchaAfterFailures - 1)).resolves.toBe(false);
    await expect(service.required(captchaAfterFailures)).resolves.toBe(true);
  });

  it('accepts a token Cloudflare confirms and sends secret + token + ip', async () => {
    const { service, calls } = turnstileFixture({ success: true });
    await expect(service.verify('token-ok', '192.0.2.7')).resolves.toBe('passed');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(turnstileSiteVerifyUrl);
    const body = new URLSearchParams(calls[0]?.body ?? '');
    expect(body.get('secret')).toBe('1x0000000000000000000000000000000AA');
    expect(body.get('response')).toBe('token-ok');
    expect(body.get('remoteip')).toBe('192.0.2.7');
  });

  it('rejects a token Cloudflare refuses, and counts it as a captcha failure', async () => {
    const { service, metrics } = turnstileFixture({ success: false, 'error-codes': ['invalid-input-response'] });
    await expect(service.verify('token-bad')).resolves.toBe('failed');
    expect(metrics.record).toHaveBeenCalledWith('captcha-failed');
  });

  it('a missing token is a request for the challenge, not a verification call', async () => {
    const { service, calls, metrics } = turnstileFixture({ success: true });
    await expect(service.verify(null, '192.0.2.7')).resolves.toBe('missing');
    await expect(service.verify('   ', '192.0.2.7')).resolves.toBe('missing');
    expect(calls).toEqual([]);
    expect(metrics.record).not.toHaveBeenCalled();
  });

  it('an over-long token is refused without a network call', async () => {
    const { service, calls, metrics } = turnstileFixture({ success: true });
    await expect(service.verify('x'.repeat(captchaTokenMaxLength + 1))).resolves.toBe('failed');
    expect(calls).toEqual([]);
    expect(metrics.record).toHaveBeenCalledWith('captcha-failed');
  });

  it('turnstile without a stored secret fails open and says so', async () => {
    const metrics = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new LoginCaptchaService(
      settingsWith({ [providerKey]: 'turnstile' }),
      metrics as never,
      async () => {
        throw new Error('must not be called without a secret');
      },
    );
    await expect(service.verify('token')).resolves.toBe('unavailable');
    expect(metrics.record).toHaveBeenCalledWith('captcha-skipped');
  });

  it('a timeout, a network error, a non-2xx answer or a malformed body all fail open', async () => {
    const network = turnstileFixture({ success: true });
    const failing = new LoginCaptchaService(
      settingsWith({ [providerKey]: 'turnstile', [secretKey]: 'secret' }),
      network.metrics as never,
      async () => {
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      },
    );
    await expect(failing.verify('token')).resolves.toBe('unavailable');

    const nonTwoXx = turnstileFixture({ success: true }, false, 503);
    await expect(nonTwoXx.service.verify('token')).resolves.toBe('unavailable');
    expect(nonTwoXx.metrics.record).toHaveBeenCalledWith('captcha-skipped');

    const malformed = turnstileFixture({ oops: true });
    await expect(malformed.service.verify('token')).resolves.toBe('unavailable');
    expect(malformed.metrics.record).toHaveBeenCalledWith('captcha-skipped');
  });

  it('a metrics failure never changes the verdict', async () => {
    const { service } = turnstileFixture({ success: true });
    const withBrokenMetrics = new LoginCaptchaService(
      settingsWith({ [providerKey]: 'turnstile', [secretKey]: 'secret' }),
      {
        record: async () => {
          throw new Error('redis down');
        },
      } as never,
      async () => ({ ok: true, status: 200, json: async () => ({ success: false }) }),
    );
    await expect(withBrokenMetrics.verify('token')).resolves.toBe('failed');
    await expect(service.verify('token')).resolves.toBe('passed');
  });

  it('the two answers of the gate carry stable codes for the sign-in page', () => {
    const required = createCaptchaRequiredException();
    const failed = createCaptchaFailedException();
    expect(required).toBeInstanceOf(BadRequestException);
    expect(required.getResponse()).toMatchObject({ code: 'CAPTCHA_REQUIRED' });
    expect(failed.getResponse()).toMatchObject({ code: 'CAPTCHA_FAILED' });
  });
});
