import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { JsonValue } from '../../modules/change-log/change-log.types';
import { canonicalizeJson } from '../../modules/change-log/canonicalize-json';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxError, outboxErrorCodes } from './outbox.error';

const topicPattern = /^[a-z][a-z0-9._-]{2,99}$/u;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;
const actorPattern = /^[A-Za-z0-9][A-Za-z0-9@._:-]{2,127}$/u;
const payloadLimit = 64 * 1024;
const leaseMilliseconds = 60_000;
const retentionMilliseconds = 7 * 24 * 60 * 60 * 1_000;

type ClaimedRow = {
  id: string;
  topic: string;
  dedupeKey: string;
  payload: JsonValue;
  attempts: number;
  maxAttempts: number;
  ownerToken: string;
};

export type OutboxDelivery = Readonly<ClaimedRow>;
export type OutboxHandler = (delivery: OutboxDelivery) => Promise<void>;

@Injectable()
export class TransactionalOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(transaction: Prisma.TransactionClient, input: {
    readonly topic: string;
    readonly dedupeKey: string;
    readonly payload: JsonValue;
    readonly maxAttempts?: number;
    readonly availableAt?: Date;
  }): Promise<{ readonly id: string; readonly created: boolean }> {
    validateIdentity(input.topic, input.dedupeKey);
    const canonicalPayload = canonicalizeJson(input.payload);
    const serialized = JSON.stringify(canonicalPayload);
    if (Buffer.byteLength(serialized, 'utf8') > payloadLimit) throw new OutboxError(outboxErrorCodes.payloadTooLarge);
    const payloadHash = createHash('sha256').update(serialized).digest('hex');
    const maxAttempts = input.maxAttempts ?? 10;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new OutboxError(outboxErrorCodes.invalidInput);
    const id = randomUUID();
    const availableAt = input.availableAt ?? new Date();
    const expiresAt = new Date(Date.now() + retentionMilliseconds);
    const inserted = await transaction.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "OutboxMessage"
        ("id", "topic", "dedupeKey", "payload", "payloadHash", "maxAttempts", "nextAttemptAt", "expiresAt", "updatedAt")
      VALUES
        (${id}::uuid, ${input.topic}, ${input.dedupeKey}, ${serialized}::jsonb, ${payloadHash}, ${maxAttempts}, ${availableAt}, ${expiresAt}, NOW())
      ON CONFLICT ("topic", "dedupeKey") DO NOTHING
      RETURNING "id"`;
    if (inserted.length === 1) return { id, created: true };
    const existing = await transaction.outboxMessage.findUniqueOrThrow({
      where: { topic_dedupeKey: { topic: input.topic, dedupeKey: input.dedupeKey } },
      select: { id: true, payloadHash: true },
    });
    if (existing.payloadHash !== payloadHash) throw new OutboxError(outboxErrorCodes.payloadMismatch);
    return { id: existing.id, created: false };
  }

  async dispatchOne(topic: string, handler: OutboxHandler): Promise<'idle' | 'succeeded' | 'retry' | 'dead-letter'> {
    if (!topicPattern.test(topic)) throw new OutboxError(outboxErrorCodes.invalidInput);
    const claim = await this.claim(topic);
    if (claim === null) return 'idle';
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      void this.renewLease(claim.id, claim.ownerToken).then((renewed) => { if (!renewed) leaseLost = true; });
    }, leaseMilliseconds / 3);
    heartbeat.unref();
    try {
      await handler(claim);
      if (leaseLost || !(await this.complete(claim.id, claim.ownerToken))) throw new OutboxError(outboxErrorCodes.claimLost);
      return 'succeeded';
    } catch (error) {
      if (error instanceof OutboxError && error.code === outboxErrorCodes.claimLost) throw error;
      return this.fail(claim, error);
    } finally {
      clearInterval(heartbeat);
    }
  }

  async replayDeadLetter(id: string, input: { readonly actor: string; readonly reason: string }): Promise<void> {
    if (!actorPattern.test(input.actor) || input.reason.trim().length < 8 || input.reason.length > 500) {
      throw new OutboxError(outboxErrorCodes.invalidInput);
    }
    const changed = await this.prisma.outboxMessage.updateMany({
      where: { id, status: 'DEAD_LETTER' },
      data: {
        status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null,
        replayCount: { increment: 1 }, lastReplayedAt: new Date(), lastReplayedBy: input.actor,
        lastReplayReason: input.reason.trim(), expiresAt: new Date(Date.now() + retentionMilliseconds),
      },
    });
    if (changed.count !== 1) throw new OutboxError(outboxErrorCodes.replayConflict);
  }

  async purgeExpired(batchSize = 500): Promise<number> {
    const take = Math.max(1, Math.min(batchSize, 1_000));
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.outboxMessage.findMany({
        where: { status: { in: ['SUCCEEDED', 'DEAD_LETTER'] }, expiresAt: { lt: new Date() } },
        orderBy: { expiresAt: 'asc' }, select: { id: true }, take,
      });
      if (rows.length === 0) return 0;
      return (await transaction.outboxMessage.deleteMany({
        where: { id: { in: rows.map(({ id }) => id) }, status: { in: ['SUCCEEDED', 'DEAD_LETTER'] }, expiresAt: { lt: new Date() } },
      })).count;
    });
  }

  private async claim(topic: string): Promise<ClaimedRow | null> {
    const ownerToken = randomUUID();
    const leaseExpiresAt = new Date(Date.now() + leaseMilliseconds);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        UPDATE "OutboxMessage" SET "status" = 'DEAD_LETTER', "ownerToken" = NULL,
          "leaseExpiresAt" = NULL, "lastError" = 'lease expired after final attempt', "updatedAt" = NOW()
        WHERE "topic" = ${topic} AND "status" = 'PROCESSING' AND "leaseExpiresAt" <= NOW() AND "attempts" >= "maxAttempts"`;
      const rows = await transaction.$queryRaw<ClaimedRow[]>`
        WITH candidate AS (
          SELECT "id" FROM "OutboxMessage"
          WHERE "topic" = ${topic} AND (("status" = 'PENDING' AND "nextAttemptAt" <= NOW())
            OR ("status" = 'PROCESSING' AND "leaseExpiresAt" <= NOW()))
            AND "attempts" < "maxAttempts"
          ORDER BY "nextAttemptAt", "createdAt"
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE "OutboxMessage" AS message
        SET "status" = 'PROCESSING', "ownerToken" = ${ownerToken}::uuid,
          "leaseExpiresAt" = ${leaseExpiresAt}, "attempts" = message."attempts" + 1, "updatedAt" = NOW()
        FROM candidate WHERE message."id" = candidate."id"
        RETURNING message."id", message."topic", message."dedupeKey", message."payload",
          message."attempts", message."maxAttempts", message."ownerToken"`;
      return rows[0] ?? null;
    });
  }

  private async renewLease(id: string, ownerToken: string): Promise<boolean> {
    const changed = await this.prisma.outboxMessage.updateMany({
      where: { id, status: 'PROCESSING', ownerToken },
      data: { leaseExpiresAt: new Date(Date.now() + leaseMilliseconds) },
    });
    return changed.count === 1;
  }

  private async complete(id: string, ownerToken: string): Promise<boolean> {
    const changed = await this.prisma.outboxMessage.updateMany({
      where: { id, status: 'PROCESSING', ownerToken },
      data: { status: 'SUCCEEDED', ownerToken: null, leaseExpiresAt: null, completedAt: new Date(), lastError: null },
    });
    return changed.count === 1;
  }

  private async fail(claim: ClaimedRow, error: unknown): Promise<'retry' | 'dead-letter'> {
    const terminal = claim.attempts >= claim.maxAttempts;
    const changed = await this.prisma.outboxMessage.updateMany({
      where: { id: claim.id, status: 'PROCESSING', ownerToken: claim.ownerToken },
      data: {
        status: terminal ? 'DEAD_LETTER' : 'PENDING', ownerToken: null, leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + backoffMilliseconds(claim.attempts)), lastError: describeError(error),
      },
    });
    if (changed.count !== 1) throw new OutboxError(outboxErrorCodes.claimLost);
    return terminal ? 'dead-letter' : 'retry';
  }
}

function validateIdentity(topic: string, key: string): void {
  if (!topicPattern.test(topic) || !keyPattern.test(key)) throw new OutboxError(outboxErrorCodes.invalidInput);
}

function backoffMilliseconds(attempt: number): number {
  return Math.min(60 * 60 * 1_000, 1_000 * 2 ** Math.min(attempt - 1, 12));
}

function describeError(error: unknown): string {
  const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return value.slice(0, 1_000);
}
