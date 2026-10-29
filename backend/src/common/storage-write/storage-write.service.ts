import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageWriteError, storageWriteErrorCodes } from './storage-write.error';
import type { StagedStorageAdapter, StorageBusinessCommit, StorageWriteResult } from './storage-write.types';

const namespacePattern = /^[a-z][a-z0-9._-]{2,79}$/u;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{7,159}$/u;
const storageKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,299}$/u;
const maximumBytes = 100 * 1024 * 1024;
const leaseMilliseconds = 60_000;

type IntentRow = { id: string; contentHash: string; sizeBytes: number; stagingKey: string; finalKey: string; status: string };

@Injectable()
export class StorageWriteService {
  constructor(private readonly prisma: PrismaService) {}

  async write<T>(input: {
    namespace: string;
    key: string;
    finalKey: string;
    contents: Buffer;
    adapter: StagedStorageAdapter;
    commit: StorageBusinessCommit<T>;
    maxAttempts?: number;
  }): Promise<StorageWriteResult<T>> {
    validate(input);
    const id = randomUUID();
    const stagingKey = `.staging/${id}`;
    const contentHash = createHash('sha256').update(input.contents).digest('hex');
    await input.adapter.stage(stagingKey, input.contents);
    let transactionResult: { row: IntentRow; value: T | null; inserted: boolean };
    try {
      transactionResult = await this.prisma.$transaction(async (transaction) => {
        const inserted = await transaction.$queryRaw<IntentRow[]>`
          INSERT INTO "StorageWriteIntent"
            ("id", "namespace", "key", "stagingKey", "finalKey", "contentHash", "sizeBytes", "maxAttempts", "updatedAt")
          VALUES (${id}::uuid, ${input.namespace}, ${input.key}, ${stagingKey}, ${input.finalKey}, ${contentHash},
            ${input.contents.length}, ${input.maxAttempts ?? 10}, NOW())
          ON CONFLICT ("namespace", "key") DO NOTHING RETURNING *`;
        if (inserted[0]) {
          const value = await input.commit(transaction, { id, finalKey: input.finalKey, contentHash, sizeBytes: input.contents.length });
          return { row: inserted[0], value, inserted: true };
        }
        const existing = await transaction.storageWriteIntent.findUniqueOrThrow({
          where: { namespace_key: { namespace: input.namespace, key: input.key } },
        });
        if (existing.contentHash !== contentHash || existing.finalKey !== input.finalKey) {
          throw new StorageWriteError(storageWriteErrorCodes.conflict);
        }
        return { row: existing, value: null, inserted: false };
      });
    } catch (error) {
      try { await input.adapter.remove(stagingKey); }
      catch (compensationError) {
        await this.prisma.storageWriteIntent.create({ data: {
          id, namespace: 'storage.compensation', key: id, stagingKey, finalKey: `.discarded/${id}`,
          contentHash, sizeBytes: input.contents.length, status: 'FAILED', attempts: input.maxAttempts ?? 10,
          maxAttempts: input.maxAttempts ?? 10, lastError: describe(compensationError),
        } });
        throw new StorageWriteError(storageWriteErrorCodes.compensationFailed, { cause: error });
      }
      throw error;
    }
    if (!transactionResult.inserted) await input.adapter.remove(stagingKey);
    if (transactionResult.row.status === 'READY') {
      return { id: transactionResult.row.id, finalKey: transactionResult.row.finalKey, status: 'READY', value: null, replayed: true };
    }
    const promoted = await this.promote(transactionResult.row, input.adapter);
    return { id: transactionResult.row.id, finalKey: transactionResult.row.finalKey,
      status: promoted ? 'READY' : 'PENDING_PROMOTION', value: transactionResult.value, replayed: !transactionResult.inserted };
  }

  async reconcileOne(namespace: string, adapter: StagedStorageAdapter): Promise<'idle' | 'ready' | 'retry' | 'failed'> {
    if (!namespacePattern.test(namespace)) throw new StorageWriteError(storageWriteErrorCodes.invalidInput);
    const ownerToken = randomUUID();
    await this.prisma.$executeRaw`
      UPDATE "StorageWriteIntent" SET "status" = 'FAILED', "ownerToken" = NULL, "leaseExpiresAt" = NULL,
        "lastError" = 'lease expired after final attempt', "updatedAt" = NOW()
      WHERE "namespace" = ${namespace} AND "status" = 'PROCESSING' AND "leaseExpiresAt" <= NOW()
        AND "attempts" >= "maxAttempts"`;
    const rows = await this.prisma.$queryRaw<IntentRow[]>`
      WITH candidate AS (
        SELECT "id" FROM "StorageWriteIntent"
        WHERE "namespace" = ${namespace}
          AND (("status" = 'PENDING_PROMOTION' AND "nextAttemptAt" <= NOW())
            OR ("status" = 'PROCESSING' AND "leaseExpiresAt" <= NOW()))
          AND "attempts" < "maxAttempts"
        ORDER BY "nextAttemptAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "StorageWriteIntent" intent SET "status" = 'PROCESSING', "ownerToken" = ${ownerToken}::uuid,
        "leaseExpiresAt" = ${new Date(Date.now() + leaseMilliseconds)}, "attempts" = intent."attempts" + 1, "updatedAt" = NOW()
      FROM candidate WHERE intent."id" = candidate."id" RETURNING intent.*`;
    const row = rows[0];
    if (!row) return 'idle';
    try {
      await adapter.promote(row.stagingKey, row.finalKey);
      const changed = await this.prisma.storageWriteIntent.updateMany({
        where: { id: row.id, status: 'PROCESSING', ownerToken },
        data: { status: 'READY', ownerToken: null, leaseExpiresAt: null, readyAt: new Date(), lastError: null },
      });
      return changed.count === 1 ? 'ready' : 'retry';
    } catch (error) {
      const current = await this.prisma.storageWriteIntent.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true, maxAttempts: true } });
      const terminal = current.attempts >= current.maxAttempts;
      await this.prisma.storageWriteIntent.updateMany({
        where: { id: row.id, status: 'PROCESSING', ownerToken },
        data: { status: terminal ? 'FAILED' : 'PENDING_PROMOTION', ownerToken: null, leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 1_000 * 2 ** Math.min(current.attempts - 1, 12))), lastError: describe(error) },
      });
      return terminal ? 'failed' : 'retry';
    }
  }

  async compensateFailed(id: string, adapter: StagedStorageAdapter): Promise<void> {
    const row = await this.prisma.storageWriteIntent.findFirstOrThrow({ where: { id, status: 'FAILED' } });
    await adapter.remove(row.stagingKey);
    await this.prisma.storageWriteIntent.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'COMPENSATED', lastError: null } });
  }

  private async promote(row: IntentRow, adapter: StagedStorageAdapter): Promise<boolean> {
    try {
      await adapter.promote(row.stagingKey, row.finalKey);
      const changed = await this.prisma.storageWriteIntent.updateMany({
        where: { id: row.id, status: { in: ['PENDING_PROMOTION', 'PROCESSING'] } },
        data: { status: 'READY', ownerToken: null, leaseExpiresAt: null, readyAt: new Date(), lastError: null },
      });
      return changed.count === 1;
    } catch (error) {
      await this.prisma.storageWriteIntent.updateMany({ where: { id: row.id, status: 'PENDING_PROMOTION' }, data: { lastError: describe(error) } });
      return false;
    }
  }
}

function validate(input: { namespace: string; key: string; finalKey: string; contents: Buffer; maxAttempts?: number }): void {
  const attempts = input.maxAttempts ?? 10;
  if (!namespacePattern.test(input.namespace) || !keyPattern.test(input.key) || !storageKeyPattern.test(input.finalKey) ||
      input.finalKey.startsWith('.') || input.finalKey.includes('..') || !Number.isInteger(attempts) || attempts < 1 || attempts > 100) {
    throw new StorageWriteError(storageWriteErrorCodes.invalidInput);
  }
  if (input.contents.length > maximumBytes) throw new StorageWriteError(storageWriteErrorCodes.payloadTooLarge);
}

function describe(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 1_000);
}
