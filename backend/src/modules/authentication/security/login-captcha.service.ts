import { Injectable, Logger, Optional } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { LoginSecurityMetricsService } from './login-security-metrics.service';

/*
  Paket 5.4.1 (M3): Cloudflare Turnstile as the human check of the password
  sign-in, wired into `LoginAttemptLimiter` exactly where the plan puts it —
  after repeated failures, next to the rate limiting that already exists.

  Rules pinned here:

    * **provider `none` (default) = no change.** No setting, no key pair or an
      unreadable setting all mean "not configured"; then nothing is demanded,
      no network call happens and the limiter behaves like before this package.
    * the challenge is demanded from the **IP bucket** on, not per account: that
      is the counter a distributed attack moves, and it is the same counter that
      ends in the temporary 429.
    * a solved challenge is the price of **one** attempt: an IP that already
      passed the block threshold may try again with a valid token, while every
      attempt keeps counting — an automated client would have to solve a
      challenge per attempt, which is the point.
    * `secret` never leaves the process: it is read through
      `getSecretForInternalUse`, sent only to Cloudflare's `siteverify`
      endpoint, and neither the token nor the secret is ever logged.
    * a network problem is **fail-open in the un-blocked case and keeps today's
      429 in the blocked case**: an unreachable Cloudflare must not lock an
      office out of signing in, and it must not lift the rate limit either.
      Every such call logs one sanitized warning and increments
      `security:metrics:captcha-skipped:<minute>`.
*/

export const turnstileSiteVerifyUrl =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Three seconds, same budget as the Pwned Passwords check: sign-in stays responsive. */
export const turnstileTimeoutMilliseconds = 3000;

/** Paket 5.4.1 (M3): challenges start here; the plan names 5 as the example. */
export const captchaAfterFailures = 5;

/** Turnstile tokens are a few hundred bytes; this is a hard ceiling, not a target. */
export const captchaTokenMaxLength = 4096;

export type CaptchaProvider = 'none' | 'turnstile';

export type LoginCaptchaVerdict =
  /** Not configured, or the caller is below the threshold: the request goes through. */
  | 'not-required'
  /** A token was presented and Cloudflare accepted it. */
  | 'passed'
  /** A token was presented and Cloudflare rejected it (or it had expired). */
  | 'failed'
  /** No token at all — the client has to solve the challenge first. */
  | 'missing'
  /** Cloudflare could not be asked: timeout, network error, non-2xx, unusable body. */
  | 'unavailable';

export type LoginCaptchaDescription = {
  readonly provider: CaptchaProvider;
  /** Public site key for the widget; `null` while the provider is `none`. */
  readonly siteKey: string | null;
  /** Failures of one IP after which the challenge is demanded. */
  readonly afterFailures: number;
};

type FetchLike = (
  input: string,
  init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
    readonly signal?: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

@Injectable()
export class LoginCaptchaService {
  private readonly logger = new Logger(LoginCaptchaService.name);
  private readonly fetchImpl: FetchLike;

  constructor(
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() private readonly metrics?: LoginSecurityMetricsService,
    // Test seam only: production uses the global fetch. A transport failure is
    // never an error the caller has to handle — it is an `unavailable` verdict.
    @Optional() fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** Public description for `GET /auth/providers`; never contains the secret. */
  async describe(): Promise<LoginCaptchaDescription> {
    const provider = await this.readProvider();
    if (provider === 'none') {
      return { provider, siteKey: null, afterFailures: captchaAfterFailures };
    }
    const siteKey = await this.readString(settingKeys.privateSecurityCaptchaSiteKey);
    return {
      provider,
      siteKey: siteKey.length > 0 ? siteKey : null,
      afterFailures: captchaAfterFailures,
    };
  }

  /** Whether this request has to carry a solved challenge. */
  /**
   * Whether the attempt needs a solved challenge. The challenge comes at
   * `captchaAfterFailures`, or earlier when the block itself starts sooner
   * (`blockAfterFailures` = the configured limit): a challenge that arrives after
   * the 429 would never be shown, because the blocked client never gets to
   * present it. Paket 5.4.1 closeout.
   */
  async required(failures: number, blockAfterFailures = Number.POSITIVE_INFINITY): Promise<boolean> {
    if (failures < Math.min(captchaAfterFailures, blockAfterFailures)) return false;
    return (await this.readProvider()) === 'turnstile';
  }

  /**
   * Verdict for one sign-in attempt. `token` is the opaque Turnstile response
   * the browser got from the widget; `ip` is passed to Cloudflare only when it
   * is known, and it is not logged here either.
   */
  async verify(token: string | null | undefined, ip?: string): Promise<LoginCaptchaVerdict> {
    if ((await this.readProvider()) !== 'turnstile') {
      // Provider none: nothing is demanded and no network call is made. The
      // failure threshold is the caller's decision (`required` above).
      return 'not-required';
    }
    const trimmed = (token ?? '').trim();
    if (trimmed.length === 0) return 'missing';
    if (trimmed.length > captchaTokenMaxLength) {
      await this.recordMetric('captcha-failed');
      return 'failed';
    }
    const secret = await this.readSecret();
    if (secret.length === 0) {
      // Provider says turnstile but no secret is stored: cannot verify, so the
      // limiter keeps its own protection (fail-open in the un-blocked case).
      await this.reportSkip('no_secret');
      return 'unavailable';
    }

    const body = new URLSearchParams({ secret, response: trimmed });
    if (ip !== undefined && ip.length > 0) body.set('remoteip', ip);
    try {
      const response = await this.fetchImpl(turnstileSiteVerifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(turnstileTimeoutMilliseconds),
      });
      if (!response.ok) {
        await this.reportSkip('non_2xx', response.status);
        return 'unavailable';
      }
      const payload = (await response.json()) as { readonly success?: unknown };
      if (typeof payload.success !== 'boolean') {
        await this.reportSkip('malformed');
        return 'unavailable';
      }
      if (!payload.success) {
        await this.recordMetric('captcha-failed');
        return 'failed';
      }
      return 'passed';
    } catch (error) {
      await this.reportSkip('network');
      this.logger.warn(
        `turnstile verification unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      return 'unavailable';
    }
  }

  /** Provider setting; anything unreadable or unknown counts as `none`. */
  private async readProvider(): Promise<CaptchaProvider> {
    const value = await this.readString(settingKeys.privateSecurityCaptchaProvider);
    return value === 'turnstile' ? 'turnstile' : 'none';
  }

  private async readString(key: string): Promise<string> {
    if (this.settingsService === undefined) return '';
    try {
      const value = await this.settingsService.getSetting(key);
      return typeof value === 'string' ? value.trim() : '';
    } catch {
      // An unreadable setting must never turn the check on by accident.
      return '';
    }
  }

  private async readSecret(): Promise<string> {
    if (this.settingsService === undefined) return '';
    try {
      const value = await this.settingsService.getSecretForInternalUse(
        settingKeys.privateSecurityCaptchaSecretKey,
      );
      return typeof value === 'string' ? value.trim() : '';
    } catch {
      return '';
    }
  }

  /** A skip is never cached and never blocks a sign-in by itself. */
  private async reportSkip(reason: string, status?: number): Promise<void> {
    await this.recordMetric('captcha-skipped');
    this.logger.warn(
      `turnstile verification skipped (${reason}${status === undefined ? '' : ` ${status}`}) — falling back to the rate limiter`,
    );
  }

  private async recordMetric(event: 'captcha-skipped' | 'captcha-failed'): Promise<void> {
    if (this.metrics === undefined) return;
    try {
      await this.metrics.record(event);
    } catch {
      // Metrics are diagnostics; they never change the sign-in answer.
    }
  }
}

/**
 * The two answers of the challenge gate. Both are 400 with a stable code the
 * sign-in page maps: `CAPTCHA_REQUIRED` asks the client to solve the widget and
 * retry, `CAPTCHA_FAILED` means the presented token was not accepted.
 */
export function createCaptchaRequiredException(): BadRequestException {
  return new BadRequestException({
    code: 'CAPTCHA_REQUIRED',
    message: 'Human verification required',
  });
}

export function createCaptchaFailedException(): BadRequestException {
  return new BadRequestException({
    code: 'CAPTCHA_FAILED',
    message: 'Human verification failed',
  });
}
