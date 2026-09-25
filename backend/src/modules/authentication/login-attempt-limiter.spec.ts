import { HttpException, UnauthorizedException } from '@nestjs/common';
import {
  LoginAttemptLimiter,
  changePasswordAttemptKey,
  createMemoryLoginAttemptStore,
  loginAttemptKey,
  loginAttemptLimits,
} from './login-attempt-limiter';

describe('LoginAttemptLimiter (review 2026-09-25)', () => {
  const key = loginAttemptKey(' Agent@Example.com ', '10.0.0.1');
  const wrong = () => Promise.reject(new UnauthorizedException({ code: 'INVALID_CREDENTIALS' }));

  it('locks out after 5 wrong passwords with 429', async () => {
    const limiter = new LoginAttemptLimiter();
    for (let i = 0; i < loginAttemptLimits.maxFailures; i += 1) {
      await expect(limiter.guard(key, wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    const locked = limiter.guard(key, async () => 'ok');
    await expect(locked).rejects.toBeInstanceOf(HttpException);
    await expect(limiter.guard(key, async () => 'ok')).rejects.toMatchObject({ status: 429 });
  });

  it('a successful login clears the counter', async () => {
    const limiter = new LoginAttemptLimiter();
    for (let i = 0; i < loginAttemptLimits.maxFailures - 1; i += 1) {
      await expect(limiter.guard(key, wrong)).rejects.toThrow();
    }
    await expect(limiter.guard(key, async () => 'ok')).resolves.toBe('ok');
    await expect(limiter.guard(key, wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(limiter.guard(key, async () => 'ok')).resolves.toBe('ok');
  });

  it('keys are per e-mail (case-insensitive) and IP', () => {
    expect(loginAttemptKey('A@x.ba', '1.1.1.1')).toBe(loginAttemptKey(' a@X.BA', '1.1.1.1'));
    expect(loginAttemptKey('a@x.ba', '1.1.1.1')).not.toBe(loginAttemptKey('a@x.ba', '2.2.2.2'));
  });

  it('memory store expires the window', async () => {
    let now = 0;
    const store = createMemoryLoginAttemptStore(() => now);
    await store.recordFailure('k', 60);
    expect(await store.count('k')).toBe(1);
    now = 61_000;
    expect(await store.count('k')).toBe(0);
  });
});

describe('change-password attempt key (review N1)', () => {
  it('is per client IP and separate from sign-in keys', () => {
    expect(changePasswordAttemptKey(' 10.0.0.9 ')).toBe('auth:change-password-fail:10.0.0.9');
    expect(changePasswordAttemptKey(undefined)).toBe('auth:change-password-fail:unknown');
    expect(changePasswordAttemptKey('10.0.0.9')).not.toBe(loginAttemptKey('x', '10.0.0.9'));
  });
});
