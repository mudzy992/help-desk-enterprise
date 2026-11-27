import { expect, test } from '@playwright/test';
import {
  isTotpReplayError,
  TOTP_REPLAY_CODE,
  withFreshTotpCode,
} from '../helpers/mfa';

/*
  Nightly run 45973287907 (2026-11-27): `37-authentication-security` failed twice
  on `POST /auth/mfa/recovery-codes` with `MFA_INVALID_CODE` while a PR run used
  the same shared stack. The server's replay guard (a TOTP step is single-use) is
  correct; the harness assumed it owned that counter. `withFreshTotpCode` spends
  the next step when the server says the previous one is gone, and nothing else.

  These tests are offline: the code source is injected, so no secret, clock or
  `.auth/mfa.json` is touched.
*/

function replayError(): Error & { code: string } {
  const error = new Error(
    `${TOTP_REPLAY_CODE}: {"code":"${TOTP_REPLAY_CODE}"} (from POST /auth/mfa/verify)`,
  ) as Error & { code: string };
  error.code = TOTP_REPLAY_CODE;
  return error;
}

test('a rejected step is retried once with the next code', async () => {
  const codes = ['111111', '222222'];
  const seen: string[] = [];

  const result = await withFreshTotpCode(
    'admin@example.test',
    async (code) => {
      seen.push(code);
      if (code === '111111') throw replayError();
      return `session-${code}`;
    },
    { nextCode: async () => codes.shift() ?? '333333' },
  );

  expect(result).toBe('session-222222');
  expect(seen).toEqual(['111111', '222222']);
});

test('a real rejection is not retried', async () => {
  let attempts = 0;

  await expect(
    withFreshTotpCode(
      'admin@example.test',
      async () => {
        attempts += 1;
        const error = new Error('HTTP_403: MFA_POLICY_REJECTED') as Error & { code: string };
        error.code = 'MFA_POLICY_REJECTED';
        throw error;
      },
      { nextCode: async () => '111111' },
    ),
  ).rejects.toThrow(/MFA_POLICY_REJECTED/u);

  expect(attempts).toBe(1);
});

test('a persistent replay rejection stops after the configured attempts', async () => {
  let attempts = 0;

  await expect(
    withFreshTotpCode(
      'admin@example.test',
      async () => {
        attempts += 1;
        throw replayError();
      },
      { attempts: 3, nextCode: async () => `code-${attempts}` },
    ),
  ).rejects.toThrow(new RegExp(TOTP_REPLAY_CODE, 'u'));

  expect(attempts).toBe(3);
});

test('the replay predicate reads the code, the message, and nothing else', () => {
  expect(isTotpReplayError(replayError())).toBe(true);
  expect(isTotpReplayError(new Error(`boom ${TOTP_REPLAY_CODE}`))).toBe(true);
  expect(isTotpReplayError(new Error('HTTP_500'))).toBe(false);
  expect(isTotpReplayError(null)).toBe(false);
  expect(isTotpReplayError('MFA_INVALID_CODE')).toBe(false);
});
