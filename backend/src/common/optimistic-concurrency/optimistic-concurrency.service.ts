import { Injectable } from '@nestjs/common';
import { OptimisticConcurrencyError, optimisticConcurrencyErrorCodes } from './optimistic-concurrency.error';

const maximumVersion = 2_147_483_646;
const strongVersionEtag = /^"v([1-9][0-9]{0,9})"$/u;

export type VersionedMutation<T> = Readonly<{ value: T; version: number }>;
export type VersionedMutationResult<T> = Readonly<{ value: T; version: number; etag: string }>;

@Injectable()
export class OptimisticConcurrencyService {
  async execute<T>(input: {
    readonly ifMatch: string | string[] | undefined;
    /** Atomic UPDATE ... WHERE id = ? AND version = expected; return null when no row won. */
    readonly mutate: (expectedVersion: number) => Promise<VersionedMutation<T> | null>;
    /** Authorized current-version reread used only to classify a failed CAS. */
    readonly readCurrentVersion: () => Promise<number | null>;
  }): Promise<VersionedMutationResult<T>> {
    const expectedVersion = parseIfMatch(input.ifMatch);
    const result = await input.mutate(expectedVersion);
    if (result === null) {
      const currentVersion = await input.readCurrentVersion();
      if (currentVersion === null) {
        throw new OptimisticConcurrencyError(optimisticConcurrencyErrorCodes.resourceNotFound, 404);
      }
      assertVersion(currentVersion);
      throw new OptimisticConcurrencyError(
        optimisticConcurrencyErrorCodes.staleWrite,
        412,
        formatVersionEtag(currentVersion),
      );
    }
    if (result.version !== expectedVersion + 1) {
      throw new OptimisticConcurrencyError(optimisticConcurrencyErrorCodes.invalidVersionTransition, 500);
    }
    return { ...result, etag: formatVersionEtag(result.version) };
  }
}

export function parseIfMatch(value: string | string[] | undefined): number {
  if (value === undefined) {
    throw new OptimisticConcurrencyError(optimisticConcurrencyErrorCodes.preconditionRequired, 428);
  }
  if (Array.isArray(value) || value.includes(',') || value.startsWith('W/')) {
    throw new OptimisticConcurrencyError(optimisticConcurrencyErrorCodes.invalidIfMatch, 400);
  }
  const match = strongVersionEtag.exec(value);
  const parsed = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(parsed) || parsed > maximumVersion) {
    throw new OptimisticConcurrencyError(optimisticConcurrencyErrorCodes.invalidIfMatch, 400);
  }
  return parsed;
}

export function formatVersionEtag(version: number): string {
  assertVersion(version);
  return `"v${version}"`;
}

function assertVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1 || version > maximumVersion + 1) {
    throw new OptimisticConcurrencyError(optimisticConcurrencyErrorCodes.invalidVersionTransition, 500);
  }
}
