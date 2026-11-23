import { PrismaService } from '../../common/prisma/prisma.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import {
  reportWindowBoundaries,
  type ReportPackWindowSemantics,
} from './pack-window-semantics';
import type { ReportPackKey } from './reports.constants';

/**
 * W7.108 (`BA-reports-18`): a preview is a **read**, not a beacon and not
 * telemetry. It returns the same ticket/personal rows an export would, so
 * leaving it unaudited made the audited export pointless — an administrator
 * could read the same data row by row through the preview and leave no trace.
 *
 * The write is deliberately fail-closed: the service records this before it
 * returns the rows, so a preview that cannot be audited is not served.
 */
export async function recordReportPreviewAudit(
  prisma: PrismaService,
  input: {
    readonly actorUserId: string;
    readonly organizationalUnitId: string;
    readonly pack: ReportPackKey;
    /** Rows the actor actually received (0 is a valid, audited outcome). */
    readonly recordCount: number;
    /** The preview hit its own cap or the pack input cap, so `recordCount` is a lower bound. */
    readonly truncated: boolean;
    readonly truncatedInput: boolean;
    readonly requestId: string | null;
    readonly window: { readonly from: Date; readonly to: Date };
    readonly windowSemantics: ReportPackWindowSemantics;
  },
): Promise<void> {
  await recordAuditEntry(prisma, {
    action: auditLogActions.reportPackPreviewed,
    entityType: auditLogEntityTypes.reportPack,
    entityId: input.pack,
    metadata: {
      pack: input.pack,
      organizationalUnitId: input.organizationalUnitId,
      from: input.window.from.toISOString(),
      to: input.window.to.toISOString(),
      // Same contract as the export: `to` is outside the period, and the pack
      // says whether it read events or the state at now.
      boundaries: reportWindowBoundaries,
      windowMode: input.windowSemantics.mode,
      recordCount: input.recordCount,
      truncated: input.truncated,
      truncatedInput: input.truncatedInput,
    },
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    organizationalUnitId: input.organizationalUnitId,
  });
}
