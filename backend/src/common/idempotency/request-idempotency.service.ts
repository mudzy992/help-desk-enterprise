import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalizeJson } from '../../modules/change-log/canonicalize-json';
import type { JsonValue } from '../../modules/change-log/change-log.types';
import { IdempotencyError, idempotencyErrorCodes } from './idempotency.error';

const namespacePattern = /^[a-z][a-z0-9._-]{2,79}$/u;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const leaseMs = 30_000;
const retentionMs = 24 * 60 * 60 * 1000;
const maxResponseBytes = 64 * 1024;

type StoredClaim = {
  id: string;
  requestHash: string;
  status: 'PROCESSING' | 'SUCCEEDED';
  ownerToken: string;
  leaseExpiresAt: Date;
  expiresAt: Date;
  responseStatus: number | null;
  responseBody: JsonValue | null;
};

export type IdempotentCommandResult<T extends JsonValue = JsonValue> = Readonly<{
  statusCode: number;
  body: T;
  replayed: boolean;
}>;

@Injectable()
export class RequestIdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T extends JsonValue>(input: {
    readonly namespace: string;
    readonly key: string;
    readonly request: JsonValue;
    readonly operation: (transaction: Prisma.TransactionClient) => Promise<{ readonly statusCode: number; readonly body: T }>;
  }): Promise<IdempotentCommandResult<T>> {
    validateIdentity(input.namespace, input.key);
    const requestHash = digest(input.request);
    const ownerToken = randomUUID();
    const claim = await this.claim(input.namespace, input.key, requestHash, ownerToken);
    if (claim.kind === 'replay') {
      return { statusCode: claim.statusCode, body: claim.body as T, replayed: true };
    }
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<StoredClaim[]>`
        SELECT * FROM "IdempotencyRecord"
        WHERE "namespace" = ${input.namespace} AND "key" = ${input.key}
        FOR UPDATE`;
      const locked = rows[0];
      if (locked?.status !== 'PROCESSING' || locked.ownerToken !== ownerToken) {
        throw new IdempotencyError(idempotencyErrorCodes.claimLost);
      }
      const result = await input.operation(transaction);
      const serialized = JSON.stringify(canonicalizeJson(result.body));
      if (Buffer.byteLength(serialized, 'utf8') > maxResponseBytes) {
        throw new IdempotencyError(idempotencyErrorCodes.responseTooLarge);
      }
      await transaction.idempotencyRecord.update({
        where: { namespace_key: { namespace: input.namespace, key: input.key } },
        data: {
          status: 'SUCCEEDED',
          responseStatus: result.statusCode,
          responseBody: result.body as Prisma.InputJsonValue,
          leaseExpiresAt: new Date(0),
        },
      });
      return { ...result, replayed: false };
    }, { timeout: leaseMs });
  }

  async purgeExpired(batchSize = 500): Promise<number> {
    const boundedBatchSize = Math.max(1, Math.min(batchSize, 1_000));
    return this.prisma.$transaction(async (transaction) => {
      const expired = await transaction.idempotencyRecord.findMany({
        where: { expiresAt: { lt: new Date() } },
        orderBy: { expiresAt: 'asc' },
        select: { id: true },
        take: boundedBatchSize,
      });
      if (expired.length === 0) return 0;
      const deleted = await transaction.idempotencyRecord.deleteMany({
        where: { id: { in: expired.map(({ id }) => id) }, expiresAt: { lt: new Date() } },
      });
      return deleted.count;
    });
  }

  private async claim(namespace: string, key: string, requestHash: string, ownerToken: string): Promise<
    | { readonly kind: 'acquired' }
    | { readonly kind: 'replay'; readonly statusCode: number; readonly body: JsonValue }
  > {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const expiresAt = new Date(now.getTime() + retentionMs);
    return this.prisma.$transaction(async (transaction) => {
      const inserted = await transaction.$queryRaw<StoredClaim[]>`
        INSERT INTO "IdempotencyRecord"
          ("id", "namespace", "key", "requestHash", "status", "ownerToken", "leaseExpiresAt", "expiresAt", "updatedAt")
        VALUES
          (${randomUUID()}, ${namespace}, ${key}, ${requestHash}, 'PROCESSING', ${ownerToken}::uuid, ${leaseExpiresAt}, ${expiresAt}, ${now})
        ON CONFLICT ("namespace", "key") DO NOTHING
        RETURNING *`;
      if (inserted.length === 1) return { kind: 'acquired' } as const;

      const existingRows = await transaction.$queryRaw<StoredClaim[]>`
        SELECT * FROM "IdempotencyRecord"
        WHERE "namespace" = ${namespace} AND "key" = ${key}
        FOR UPDATE`;
      const existing = existingRows[0];
      if (existing === undefined) throw new IdempotencyError(idempotencyErrorCodes.claimLost);
      if (existing.requestHash !== requestHash) throw new IdempotencyError(idempotencyErrorCodes.payloadMismatch);
      if (existing.status === 'SUCCEEDED' && existing.expiresAt > now) {
        return {
          kind: 'replay',
          statusCode: existing.responseStatus ?? 200,
          body: existing.responseBody,
        } as const;
      }
      if (existing.status === 'PROCESSING' && existing.leaseExpiresAt > now) {
        throw new IdempotencyError(idempotencyErrorCodes.inProgress);
      }
      await transaction.idempotencyRecord.update({
        where: { namespace_key: { namespace, key } },
        data: {
          requestHash,
          status: 'PROCESSING',
          ownerToken,
          leaseExpiresAt,
          expiresAt,
          responseStatus: null,
          responseBody: Prisma.JsonNull,
        },
      });
      return { kind: 'acquired' } as const;
    });
  }
}

function validateIdentity(namespace: string, key: string): void {
  if (!namespacePattern.test(namespace) || !keyPattern.test(key)) {
    throw new IdempotencyError(idempotencyErrorCodes.invalidKey);
  }
}

function digest(request: JsonValue): string {
  return createHash('sha256').update(JSON.stringify(canonicalizeJson(request))).digest('hex');
}
