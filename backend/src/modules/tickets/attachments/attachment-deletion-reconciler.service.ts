import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TICKET_ATTACHMENT_STORAGE } from './attachment-storage.token';
import type { TicketAttachmentStorage } from './attachments.types';
import { attachmentDeletionNamespace } from './attachment-deletion-intent';

const intervalMs = 5_000;
const leaseMs = 60_000;
type Intent = { id: string; stagingKey: string; attempts: number; maxAttempts: number };

@Injectable()
export class AttachmentDeletionReconciler implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TICKET_ATTACHMENT_STORAGE) private readonly storage: TicketAttachmentStorage,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain().catch(() => undefined), intervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    for (let index = 0; index < 25; index += 1) {
      if (!(await this.reconcileOne())) return;
    }
  }

  async reconcileOne(): Promise<boolean> {
    const owner = randomUUID();
    const rows = await this.prisma.$queryRaw<Intent[]>`
      WITH candidate AS (
        SELECT "id" FROM "StorageWriteIntent"
        WHERE "namespace" = ${attachmentDeletionNamespace}
          AND (("status" = 'PENDING_PROMOTION' AND "nextAttemptAt" <= NOW())
            OR ("status" = 'PROCESSING' AND "leaseExpiresAt" <= NOW()))
          AND "attempts" < "maxAttempts"
        ORDER BY "nextAttemptAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "StorageWriteIntent" intent
      SET "status" = 'PROCESSING', "ownerToken" = ${owner}::uuid,
          "leaseExpiresAt" = ${new Date(Date.now() + leaseMs)},
          "attempts" = intent."attempts" + 1, "updatedAt" = NOW()
      FROM candidate WHERE intent."id" = candidate."id" RETURNING intent.*`;
    const row = rows[0];
    if (row === undefined) return false;
    try {
      await this.storage.remove(row.stagingKey);
      await this.prisma.storageWriteIntent.updateMany({
        where: { id: row.id, status: 'PROCESSING', ownerToken: owner },
        data: { status: 'READY', readyAt: new Date(), ownerToken: null, leaseExpiresAt: null, lastError: null },
      });
    } catch (error) {
      const terminal = row.attempts >= row.maxAttempts;
      await this.prisma.storageWriteIntent.updateMany({
        where: { id: row.id, status: 'PROCESSING', ownerToken: owner },
        data: {
          status: terminal ? 'FAILED' : 'PENDING_PROMOTION', ownerToken: null, leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 1000 * 2 ** Math.min(row.attempts - 1, 12))),
          lastError: describe(error),
        },
      });
    }
    return true;
  }
}

function describe(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 1000);
}
