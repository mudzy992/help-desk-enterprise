import { PrismaService } from '../../common/prisma/prisma.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { ReportExportFormat, ReportPackKey } from './reports.constants';

export async function recordReportExportAudit(
  prisma: PrismaService,
  input: {
    readonly actorUserId: string;
    readonly organizationalUnitId: string;
    readonly pack: ReportPackKey;
    readonly format: ReportExportFormat;
    readonly recordCount: number;
    readonly requestId: string | null;
    /** Package 1.6 (plan §3 D4): the period and the file are part of "what". */
    readonly window?: { readonly from: Date; readonly to: Date };
    readonly fileName?: string;
  },
): Promise<void> {
  await recordAuditEntry(prisma, {
    action: auditLogActions.reportsExport,
    entityType: auditLogEntityTypes.reportPack,
    entityId: input.pack,
    metadata: {
      format: input.format,
      recordCount: input.recordCount,
      pack: input.pack,
      organizationalUnitId: input.organizationalUnitId,
      ...(input.window === undefined
        ? {}
        : { from: input.window.from.toISOString(), to: input.window.to.toISOString() }),
      ...(input.fileName === undefined ? {} : { fileName: input.fileName }),
    },
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    organizationalUnitId: input.organizationalUnitId,
  });
}
