import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { DatabaseLockError, databaseLockErrorCodes } from './database-lock.error';

const namespacePattern = /^[a-z][a-z0-9._-]{2,79}$/u;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const minimumTimeoutMs = 50;
const maximumTimeoutMs = 30_000;
const advisoryHashSeed = 7_326_741_991;

export type DatabaseLockIdentity = Readonly<{ namespace: string; key: string }>;

@Injectable()
export class DatabaseLockService {
  async withAdvisoryLock<T>(
    transaction: Prisma.TransactionClient,
    identity: DatabaseLockIdentity,
    operation: () => Promise<T>,
    timeoutMs = 5_000,
  ): Promise<T> {
    validate(identity, timeoutMs);
    try {
      await transaction.$queryRaw`SELECT set_config('lock_timeout', ${`${timeoutMs}ms`}, true)`;
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${canonicalIdentity(identity)}, ${advisoryHashSeed}))`;
    } catch (error) {
      if (postgresCode(error) === '55P03') throw new DatabaseLockError(databaseLockErrorCodes.timeout);
      throw error;
    }
    return operation();
  }

  async tryWithAdvisoryLock<T>(
    transaction: Prisma.TransactionClient,
    identity: DatabaseLockIdentity,
    operation: () => Promise<T>,
  ): Promise<T> {
    validate(identity, minimumTimeoutMs);
    const rows = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${canonicalIdentity(identity)}, ${advisoryHashSeed})) AS "acquired"`;
    if (rows[0]?.acquired !== true) throw new DatabaseLockError(databaseLockErrorCodes.unavailable);
    return operation();
  }

  async withRowLock<Row, Result>(input: {
    /** Must execute an authorized SELECT ... FOR UPDATE in this transaction. */
    readonly lock: () => Promise<Row | null>;
    readonly operation: (locked: Row) => Promise<Result>;
  }): Promise<Result> {
    const locked = await input.lock();
    if (locked === null) throw new DatabaseLockError(databaseLockErrorCodes.rowNotFound);
    return input.operation(locked);
  }
}

function canonicalIdentity(identity: DatabaseLockIdentity): string {
  return `${identity.namespace}\u0000${identity.key}`;
}

function validate(identity: DatabaseLockIdentity, timeoutMs: number): void {
  if (!namespacePattern.test(identity.namespace) || !keyPattern.test(identity.key) ||
      !Number.isInteger(timeoutMs) || timeoutMs < minimumTimeoutMs || timeoutMs > maximumTimeoutMs) {
    throw new DatabaseLockError(databaseLockErrorCodes.invalidIdentity);
  }
}

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string' && error.code === '55P03') return error.code;
  if ('meta' in error && typeof error.meta === 'object' && error.meta !== null &&
      'code' in error.meta && typeof error.meta.code === 'string') return error.meta.code;
  if ('cause' in error) return postgresCode(error.cause);
  return undefined;
}
