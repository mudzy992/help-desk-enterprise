import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import {
  LoginAttemptLimiter,
  changePasswordAttemptKey,
  accountAttemptDelayMilliseconds,
  createMemoryLoginAttemptStore,
  createRedisLoginAttemptStore,
  loginAccountAttemptKey,
  loginAttemptKey,
  loginAttemptLimits,
  passwordLoginLimits,
} from './login-attempt-limiter';

jest.mock('./jwt-signing-secret.loader', () => ({
  JwtSigningSecretLoader: class JwtSigningSecretLoader {},
}));

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

describe('independent password-login account and IP buckets (5.2.1 M2 #3)', () => {
  const secret = 'stable-shared-signing-secret-for-tests';
  const loader = { load: async () => secret } as never;
  const wrong = () => Promise.reject(new UnauthorizedException({ code: 'INVALID_CREDENTIALS' }));

  afterEach(() => jest.useRealTimers());

  it('HMACs normalized account identifiers and keeps raw e-mail out of Redis keys', () => {
    const key = loginAccountAttemptKey(' Admin@Example.com ', secret);
    expect(key).toBe(loginAccountAttemptKey('admin@example.com', secret));
    expect(key).not.toContain('admin@example.com');
    expect(key).not.toBe(loginAccountAttemptKey('admin@example.com', `${secret}-rotated`));
  });

  it('uses bounded progressive delay but never account-locks a correct password', async () => {
    jest.useFakeTimers();
    const limiter = new LoginAttemptLimiter(undefined, loader);
    const email = 'target@example.test';
    const ip = '192.0.2.1';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = limiter.guardPasswordLogin(email, ip, wrong);
      const delay = accountAttemptDelayMilliseconds(attempt);
      if (delay > 0) await jest.advanceTimersByTimeAsync(delay);
      await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(accountAttemptDelayMilliseconds(3)).toBe(250);
    expect(accountAttemptDelayMilliseconds(4)).toBe(500);
    expect(accountAttemptDelayMilliseconds(30)).toBe(passwordLoginLimits.accountDelayMaxMilliseconds);

    const valid = limiter.guardPasswordLogin(email, ip, async () => 'signed-in');
    await jest.advanceTimersByTimeAsync(accountAttemptDelayMilliseconds(4));
    await expect(valid).resolves.toBe('signed-in');
    await expect(limiter.guardPasswordLogin(email, ip, async () => 'again')).resolves.toBe('again');
  });

  it('applies progressive account delay to concurrent same-account attempts', async () => {
    jest.useFakeTimers();
    const limiter = new LoginAttemptLimiter(undefined, loader);
    const started: number[] = [];
    const attempts = Array.from({ length: 4 }, (_, index) =>
      limiter.guardPasswordLogin('parallel-login@example.test', '192.0.2.77', async () => {
        started.push(index);
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
      }),
    );
    const settled = Promise.allSettled(attempts);

    await jest.advanceTimersByTimeAsync(0);
    expect(started).toHaveLength(3);
    await jest.advanceTimersByTimeAsync(passwordLoginLimits.accountDelayBaseMilliseconds);
    expect(started).toHaveLength(4);
    await expect(settled).resolves.toHaveLength(4);
  });

  it('reserves in-flight attempts separately so concurrent failures get distinct delay indexes', async () => {
    const store = createMemoryLoginAttemptStore(() => 0);
    const key = loginAccountAttemptKey('parallel@example.test', secret);
    const indices = await Promise.all([
      store.beginAccountAttempt(key, 'attempt-1', passwordLoginLimits.accountWindowSeconds),
      store.beginAccountAttempt(key, 'attempt-2', passwordLoginLimits.accountWindowSeconds),
      store.beginAccountAttempt(key, 'attempt-3', passwordLoginLimits.accountWindowSeconds),
      store.beginAccountAttempt(key, 'attempt-4', passwordLoginLimits.accountWindowSeconds),
    ]);
    expect(indices).toEqual([0, 1, 2, 3]);

    await Promise.all(
      ['attempt-1', 'attempt-2', 'attempt-3', 'attempt-4'].map((attemptId) =>
        store.completeAccountAttempt(key, attemptId, 'credentialFailure'),
      ),
    );
    expect(await store.count(key)).toBe(4);

    const successfulIndex = await store.beginAccountAttempt(key, 'attempt-success', 1_800);
    expect(successfulIndex).toBe(4);
    await store.completeAccountAttempt(key, 'attempt-success', 'success');
    expect(await store.count(key)).toBe(0);
  });

  it('does not retain an account failure for a non-credential error', async () => {
    const store = createMemoryLoginAttemptStore(() => 0);
    const key = loginAccountAttemptKey('outage@example.test', secret);
    const index = await store.beginAccountAttempt(key, 'attempt-outage', 1_800);
    expect(index).toBe(0);
    await store.completeAccountAttempt(key, 'attempt-outage', 'other');
    expect(await store.count(key)).toBe(0);
  });

  it('a failure for one account does not lock another account sharing the IP', async () => {
    const limiter = new LoginAttemptLimiter(undefined, loader);
    await expect(limiter.guardPasswordLogin('a@example.test', '192.0.2.8', wrong)).rejects.toThrow();
    await expect(
      limiter.guardPasswordLogin('b@example.test', '192.0.2.8', async () => 'ok'),
    ).resolves.toBe('ok');
  });

  it('applies the temporary 429 only to the source IP threshold', async () => {
    const limiter = new LoginAttemptLimiter(undefined, loader);
    for (let attempt = 0; attempt < passwordLoginLimits.ipMaxFailures; attempt += 1) {
      await expect(
        limiter.guardPasswordLogin(`user-${attempt}@example.test`, '198.51.100.5', wrong),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    const login = jest.fn(async () => 'must-not-run');
    await expect(
      limiter.guardPasswordLogin('fresh@example.test', '198.51.100.5', login),
    ).rejects.toMatchObject({ status: 429 });
    expect(login).not.toHaveBeenCalled();
    await expect(
      limiter.guardPasswordLogin('fresh@example.test', '198.51.100.6', async () => 'ok'),
    ).resolves.toBe('ok');
  });

  it('Redis uses one atomic fixed-window increment-and-expire script', async () => {
    const evalScript = jest.fn().mockResolvedValue(1);
    const store = createRedisLoginAttemptStore({
      eval: evalScript,
      get: jest.fn(),
      del: jest.fn(),
    } as never);
    await expect(store.recordFailure('auth:login-fail:ip:digest', 300)).resolves.toBe(1);
    expect(evalScript).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      'auth:login-fail:ip:digest',
      '300',
    );
  });

  it('reserves and completes Redis account attempts with atomic scripts and unique attempt ids', async () => {
    const evalScript = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const store = createRedisLoginAttemptStore({
      eval: evalScript,
      get: jest.fn(),
      del: jest.fn(),
    } as never);
    const key = loginAccountAttemptKey('parallel@example.test', secret);

    await expect(store.beginAccountAttempt(key, 'attempt-42', 1_800)).resolves.toBe(2);
    await store.completeAccountAttempt(key, 'attempt-42', 'credentialFailure');

    expect(evalScript).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("redis.call('HSETNX'"),
      1,
      key,
      '1800',
      'attempt-42',
    );
    expect(evalScript).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("redis.call('HDEL'"),
      1,
      key,
      'attempt-42',
      'credentialFailure',
    );
  });

  it('shares the pseudonymous account delay across Redis-backed limiter instances', async () => {
    jest.useFakeTimers();
    const ipValues = new Map<string, string>();
    const accountStates = new Map<string, { failureCount: number; pendingIds: Set<string> }>();
    const redis = {
      get: jest.fn(async (key: string) => ipValues.get(key) ?? null),
      eval: jest.fn(async (script: string, _keyCount: number, key: string, ...args: string[]) => {
        if (script.includes('HSETNX')) {
          const state = accountStates.get(key) ?? { failureCount: 0, pendingIds: new Set<string>() };
          const delayIndex = state.failureCount + state.pendingIds.size;
          state.pendingIds.add(args[1] ?? 'missing-attempt-id');
          accountStates.set(key, state);
          return delayIndex;
        }
        if (script.includes('HDEL')) {
          const state = accountStates.get(key);
          const attemptId = args[0] ?? '';
          const outcome = args[1];
          if (state?.pendingIds.delete(attemptId)) {
            if (outcome === 'credentialFailure') state.failureCount += 1;
            if (outcome === 'success') state.failureCount = 0;
            if (state.pendingIds.size === 0 && state.failureCount === 0) accountStates.delete(key);
          }
          return 1;
        }
        const count = Number(ipValues.get(key) ?? 0) + 1;
        ipValues.set(key, String(count));
        return count;
      }),
      del: jest.fn(async (key: string) => {
        ipValues.delete(key);
        accountStates.delete(key);
        return 1;
      }),
    };
    const first = new LoginAttemptLimiter(redis as never, loader);
    const second = new LoginAttemptLimiter(redis as never, loader);
    const email = 'shared@example.test';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(first.guardPasswordLogin(email, '192.0.2.30', wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    }

    const login = second.guardPasswordLogin(email, '192.0.2.31', async () => 'shared-state');
    await jest.advanceTimersByTimeAsync(passwordLoginLimits.accountDelayBaseMilliseconds);
    await expect(login).resolves.toBe('shared-state');
    expect(accountStates.has(loginAccountAttemptKey(email, secret))).toBe(false);
    expect([...ipValues.keys(), ...accountStates.keys()].every((key) => !key.includes(email))).toBe(true);
  });

  it('fails open on Redis outage without converting sign-in to a server error', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const failure = async () => { throw new Error('redis unavailable'); };
    const redis = { get: failure, eval: failure, del: failure };
    try {
      const limiter = new LoginAttemptLimiter(redis as never, loader);
      await expect(limiter.guardPasswordLogin('user@example.test', '192.0.2.40', async () => 'ok')).resolves.toBe('ok');
      await expect(limiter.guardPasswordLogin('user@example.test', '192.0.2.40', wrong)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});

describe('change-password attempt key (review N1)', () => {
  it('is per client IP and separate from sign-in keys', () => {
    expect(changePasswordAttemptKey(' 10.0.0.9 ')).toBe('auth:change-password-fail:10.0.0.9');
    expect(changePasswordAttemptKey(undefined)).toBe('auth:change-password-fail:unknown');
    expect(changePasswordAttemptKey('10.0.0.9')).not.toBe(loginAttemptKey('x', '10.0.0.9'));
  });
});
