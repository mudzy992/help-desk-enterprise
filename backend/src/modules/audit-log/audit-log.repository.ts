import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditLogRecord } from './audit-log.types';
import { compareAuditLogChainOrder } from './verify-audit-log-chain';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  listOrganizationalUnits(): Promise<
    readonly { id: string; ouPath: string }[]
  > {
    return this.prisma.organizationalUnit.findMany({
      select: { id: true, ouPath: true },
      orderBy: { ouPath: 'asc' },
    });
  }

  async listForExport(input: {
    readonly organizationalUnitIds: readonly string[];
    readonly includeGlobalRecords: boolean;
  }): Promise<readonly AuditLogRecord[]> {
    const records = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { organizationalUnitId: { in: [...input.organizationalUnitIds] } },
          ...(input.includeGlobalRecords ? [{ organizationalUnitId: null }] : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return records.map(toAuditLogRecord);
  }

  async listChain(): Promise<readonly AuditLogRecord[]> {
    const records = await this.prisma.auditLog.findMany();
    return [...records.map(toAuditLogRecord)].sort(compareAuditLogChainOrder);
  }
}

function toAuditLogRecord(record: {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: unknown;
  readonly requestId: string | null;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly actorUserId: string | null;
  readonly organizationalUnitId: string | null;
  readonly createdAt: Date;
}): AuditLogRecord {
  return {
    id: record.id,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    metadata: asJsonValue(record.metadata),
    requestId: record.requestId,
    previousHash: record.previousHash,
    hash: record.hash,
    actorUserId: record.actorUserId,
    organizationalUnitId: record.organizationalUnitId,
    createdAt: record.createdAt,
  };
}

function asJsonValue(value: unknown): AuditLogRecord['metadata'] {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as AuditLogRecord['metadata'];
}
