import { ApiClient, ApiRequestError } from './api-client';

const MAX_RATE_LIMIT_WAITS = 2;

/**
 * One login with short waits when the stack returns `TOO_MANY_LOGIN_ATTEMPTS`
 * (usually after a burst of failed MFA codes in an earlier run).
 */
export async function loginWithRateLimitBackoff(
  api: ApiClient,
  email: string,
  password: string,
): Promise<string> {
  let waits = 0;
  for (;;) {
    try {
      return await api.login(email, password);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.code === 'TOO_MANY_LOGIN_ATTEMPTS' &&
        waits < MAX_RATE_LIMIT_WAITS
      ) {
        const retryAfter = Number(error.details?.retryAfterSeconds ?? 60);
        const cap = Number(process.env.E2E_LOGIN_RATE_LIMIT_WAIT_CAP ?? 900);
        const delayMs = Math.min(Math.max(retryAfter, 30), cap) * 1000;
        waits += 1;
        console.warn(
          `[e2e] login rate limited for ${email}; waiting ${Math.round(delayMs / 1000)}s (attempt ${waits}/${MAX_RATE_LIMIT_WAITS})…`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
}
