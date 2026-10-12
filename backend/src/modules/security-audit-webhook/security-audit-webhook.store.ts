import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  auditWebhookEpochCursor,
  isAuditWebhookAction,
  type AuditWebhookCursor,
  type AuditWebhookRow,
} from './security-audit-webhook.batch';
import { securityAuditWebhookActionPrefixes } from './security-audit-webhook.constants';
import type { AuditWebhookState, AuditWebhookStore } from './security-audit-webhook.delivery';

const stateId = 'default';

/** Prisma side of the export: the audit rows in (createdAt, id) order and one state row. */
@Injectable()
export class SecurityAuditWebhookPrismaStore implements AuditWebhookStore {
  constructor(private readonly prisma: PrismaService) {}

  async loadState(): Promise<AuditWebhookState> {
    const row = await this.prisma.securityAuditWebhookState.upsert({
      where: { id: stateId },
      create: { id: stateId },
      update: {},
    });
    return {
      cursor:
        row.cursorCreatedAt === null || row.cursorId === null
          ? null
          : { createdAt: row.cursorCreatedAt, id: row.cursorId },
      pendingSince: row.pendingSince,
      sentTotal: row.sentTotal,
      failedTotal: row.failedTotal,
      droppedTotal: row.droppedTotal,
      lastSuccessAt: row.lastSuccessAt,
      lastErrorCode: row.lastErrorCode,
    };
  }

  async saveState(state: AuditWebhookState): Promise<void> {
    const data = {
      cursorCreatedAt: state.cursor?.createdAt ?? null,
      cursorId: state.cursor?.id ?? null,
      pendingSince: state.pendingSince,
      sentTotal: state.sentTotal,
      failedTotal: state.failedTotal,
      droppedTotal: state.droppedTotal,
      lastSuccessAt: state.lastSuccessAt,
      lastErrorCode: state.lastErrorCode,
    };
    await this.prisma.securityAuditWebhookState.upsert({
      where: { id: stateId },
      create: { id: stateId, ...data },
      update: data,
    });
  }

  async newestCursor(settledBefore: Date): Promise<AuditWebhookCursor | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        AND: [this.kindFilter(), { createdAt: { lte: settledBefore } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true },
    });
    return row === null ? null : { createdAt: row.createdAt, id: row.id };
  }

  async findBatch(cursor: AuditWebhookCursor, settledBefore: Date, take: number): Promise<AuditWebhookRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        AND: [this.kindFilter(), { createdAt: { lte: settledBefore } }, this.afterCursor(cursor)],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        requestId: true,
        metadata: true,
      },
    });
    return rows.filter((row: AuditWebhookRow) => isAuditWebhookAction(row.action));
  }

  async countAfter(cursor: AuditWebhookCursor, settledBefore: Date): Promise<number> {
    return this.prisma.auditLog.count({
      where: {
        AND: [this.kindFilter(), { createdAt: { lte: settledBefore } }, this.afterCursor(cursor)],
      },
    });
  }

  private kindFilter() {
    return {
      OR: securityAuditWebhookActionPrefixes.map((prefix) => ({
        action: { startsWith: prefix },
      })),
    };
  }

  private afterCursor(cursor: AuditWebhookCursor) {
    if (cursor.createdAt.getTime() === auditWebhookEpochCursor.createdAt.getTime() && cursor.id === '') {
      return {};
    }
    return {
      OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
    };
  }
}
