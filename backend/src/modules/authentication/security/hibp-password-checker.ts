import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { LoginSecurityMetricsService } from './login-security-metrics.service';

/*
  Paket 5.4.0-d (M5): the Pwned Passwords range check.

  Protocol (k-anonymity): SHA-1 of the password, uppercase hex, send **only**
  the first five characters to
  `https://api.pwnedpasswords.com/range/<PREFIX>` and look the remaining 35
  characters up in the response. A suffix with a count greater than zero means
  the password is compromised; an absent suffix — or one with count 0, which is
  what the padded rows of `Add-Padding: true` look like — means it is clean.

  SHA-1 is used here **only** because the HIBP k-anonymity protocol is defined
  over it; it is not used as a password-hashing function anywhere (local
  passwords are hashed with bcrypt via `hashLocalPassword`).

  Rules pinned here:
    * the full hash, the suffix and the password never leave the process —
      only the five-character prefix is sent, and nothing sensitive is logged;
    * a successful range answer is cached per prefix for exactly 24 h
      (86 400 s) under a namespaced key that contains no secret material;
    * a cache read that fails falls through to the network; a cache write that
      fails never invalidates an answer that already arrived;
    * timeouts, network errors, non-2xx answers and unusable bodies are never
      cached, are **fail-open** (the password is accepted), log one sanitized
      warning and increment `security:metrics:hibp-skipped:<minute>`;
    * the setting is read per call (an admin toggle applies immediately) and
      only an explicit `false` disables the check — an absent or unreadable
      value means enabled, because the default is ON.
*/

export const hibpRangeUrl = 'https://api.pwnedpasswords.com/range/';

/** The design pins three seconds; a slow Pwned Passwords API must not delay a password change. */
export const hibpTimeoutMilliseconds = 3000;

/** 24 hours, exactly. */
export const hibpCacheTtlSeconds = 86_400;

/** Namespaced under the security keys; carries the five-character prefix only. */
export const hibpCacheKeyPrefix = 'security:hibp:range:';

export const hibpViolation = 'PWNED_PASSWORD' as const;

export type HibpPasswordVerdict = 'clean' | 'pwned' | 'unavailable';

export type HibpSkipReason = 'timeout' | 'network' | 'non_2xx' | 'malformed';

type FetchLike = (
  input: string,
  init?: { readonly headers?: Record<string, string>; readonly signal?: AbortSignal },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export function hibpCacheKey(prefix: string): string {
  return `${hibpCacheKeyPrefix}${prefix}`;
}

/**
 * SHA-1 in uppercase hexadecimal, the shape the range API is defined over.
 * Exported for the unit tests; callers never see the value.
 */
export function hashForHibp(password: string): string {
  return createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
}

/**
 * Looks the 35-character suffix up in one range body. Returns the reported
 * count (0 when the suffix is absent or carries the padded count 0), or `null`
 * when the body is unusable — no `<SUFFIX>:<COUNT>` line at all. A `null` body
 * is treated exactly like a failed request: fail-open, never cached.
 */
export function findHibpSuffixCount(body: string, suffix: string): number | null {
  const wanted = suffix.trim().toUpperCase();
  let reported: number | null = null;
  let sawUsableLine = false;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const candidate = line.slice(0, separator).trim().toUpperCase();
    const count = Number.parseInt(line.slice(separator + 1).trim(), 10);
    if (!/^[0-9A-F]{20,}$/.test(candidate) || !Number.isFinite(count) || count < 0) continue;
    sawUsableLine = true;
    if (candidate === wanted) reported = count;
  }
  if (!sawUsableLine) return null;
  return reported ?? 0;
}

@Injectable()
export class HibpPasswordChecker {
  private readonly logger = new Logger(HibpPasswordChecker.name);
  private readonly fetchImpl: FetchLike;

  constructor(
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() @Inject(redisTokens.client) private readonly redis?: Redis,
    @Optional() private readonly metrics?: LoginSecurityMetricsService,
    // Test seam only: production uses the global fetch. A transport failure is
    // never an error the caller has to handle — it is a `unavailable` verdict.
    @Optional() fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /**
   * The single entry point. `pwned` is the only verdict that rejects a
   * password; `clean` and `unavailable` both accept it.
   */
  async check(password: string): Promise<HibpPasswordVerdict> {
    if (password.length === 0) {
      // The offline policy rejects blank passwords before this point; checking
      // an empty string would only waste a round trip.
      return 'clean';
    }
    if (!(await this.isEnabled())) {
      // Setting off: no network call and no `hibp-skipped` metric.
      return 'clean';
    }
    const hash = hashForHibp(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const cached = await this.readCache(prefix);
    if (cached !== null) {
      const count = findHibpSuffixCount(cached, suffix);
      if (count !== null) return count > 0 ? 'pwned' : 'clean';
      // An unusable cached body is not evidence; fall through to the network.
    }

    const body = await this.fetchRange(prefix);
    if (body === null) return 'unavailable';
    const count = findHibpSuffixCount(body, suffix);
    if (count === null) {
      await this.reportSkip('malformed');
      return 'unavailable';
    }
    await this.writeCache(prefix, body);
    return count > 0 ? 'pwned' : 'clean';
  }

  /**
   * Dynamic read: the limiter-style loader pattern would cache nothing anyway,
   * and an admin toggle has to apply to the very next password change. Absent,
   * unreadable or malformed values all count as enabled (default ON).
   */
  private async isEnabled(): Promise<boolean> {
    if (this.settingsService === undefined) return true;
    try {
      const value = await this.settingsService.getSetting(
        settingKeys.privateSecurityHibpEnabled,
      );
      return value !== false;
    } catch {
      return true;
    }
  }

  private async readCache(prefix: string): Promise<string | null> {
    if (this.redis === undefined || this.redis === null) return null;
    try {
      const value = await this.redis.get(hibpCacheKey(prefix));
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      // A cache read failure must never skip the network check.
      return null;
    }
  }

  private async writeCache(prefix: string, body: string): Promise<void> {
    if (this.redis === undefined || this.redis === null) return;
    try {
      await this.redis.set(hibpCacheKey(prefix), body, 'EX', hibpCacheTtlSeconds);
    } catch {
      // A cache write failure must never undo a check that already succeeded.
    }
  }

  /** Returns the range body, or null after recording a fail-open skip. */
  private async fetchRange(prefix: string): Promise<string | null> {
    try {
      const response = await this.fetchImpl(`${hibpRangeUrl}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(hibpTimeoutMilliseconds),
      });
      if (!response.ok) {
        await this.reportSkip('non_2xx', response.status);
        return null;
      }
      const body = await response.text();
      return body.length > 0 ? body : null;
    } catch (error) {
      await this.reportSkip(isTimeoutError(error) ? 'timeout' : 'network');
      return null;
    }
  }

  /**
   * One sanitized warning plus one counter. The log line carries the reason
   * and — for a non-2xx answer — the status code; never the prefix, the
   * suffix, the hash, the password or any part of a response body.
   */
  private async reportSkip(reason: HibpSkipReason, status?: number): Promise<void> {
    const statusSuffix = status === undefined ? '' : ` status=${status}`;
    this.logger.warn(
      `hibp range check unavailable (${reason}${statusSuffix}); password accepted (fail-open)`,
    );
    try {
      await this.metrics?.record('hibp-skipped');
    } catch {
      // Metrics are best-effort; they must never change the verdict.
    }
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'TimeoutError'
  );
}
