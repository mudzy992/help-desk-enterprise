import { Injectable } from '@nestjs/common';
import { DirectorySyncError } from '../directory-sync.error';

/**
 * Paket 1.8 (A3, RAW §901): after an LDAP error no new query is sent for
 * `retryBackoffMinutes`. Kept per process — the backend and worker each back
 * off on their own; the DC sees at most one failed attempt per process per
 * window, which is the protection the requirement asks for.
 */
@Injectable()
export class DirectoryBackoff {
  private failedAt: number | null = null;
  private lastErrorCode: string | null = null;

  assertOpen(nowMilliseconds: number, backoffMilliseconds: number): void {
    if (this.failedAt === null || backoffMilliseconds <= 0) {
      return;
    }
    const retryAt = this.failedAt + backoffMilliseconds;
    if (nowMilliseconds < retryAt) {
      throw new DirectorySyncError('DIRECTORY_BACKOFF', 'Directory backoff', {
        retryAt: new Date(retryAt).toISOString(),
        lastErrorCode: this.lastErrorCode,
      });
    }
  }

  recordFailure(nowMilliseconds: number, errorCode: string): void {
    this.failedAt = nowMilliseconds;
    this.lastErrorCode = errorCode;
  }

  recordSuccess(): void {
    this.failedAt = null;
    this.lastErrorCode = null;
  }

  snapshot(backoffMilliseconds: number): { retryAt: string | null; lastErrorCode: string | null } {
    return {
      retryAt:
        this.failedAt === null ? null : new Date(this.failedAt + backoffMilliseconds).toISOString(),
      lastErrorCode: this.lastErrorCode,
    };
  }
}
