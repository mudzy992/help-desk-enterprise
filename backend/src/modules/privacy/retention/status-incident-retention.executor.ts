import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { RetentionCategory } from '../privacy.constants';
import { retentionRedactionMarker } from './retention-executors';

/** Batch size for status-page retention (incidents + their updates/links/subscriptions). */
const statusIncidentBatch = 50;

/**
 * Paket 2.6 / W6.13: retention executor for status-page incidents.
 *
 * Archives resolved incidents older than the cutoff: redacts title/author,
 * redacts timeline update messages/authors, and removes ticket links and
 * subscriptions. The incident skeleton (id, status, dates, service count) is
 * kept so reports and uptime history remain consistent.
 */
export function createStatusIncidentRetentionExecutor(
  prisma: PrismaService,
): { readonly category: RetentionCategory; preview(cutoff: Date): Promise<import('./retention-executors').RetentionPreview>; executeBatch(cutoff: Date): Promise<import('./retention-executors').RetentionBatch> } {
  const category: RetentionCategory = 'statusIncidents';

  async function preview(cutoff: Date) {
    const [incidentCount, updateCount] = await Promise.all([
      prisma.serviceIncident.count({
        where: {
          status: 'RESOLVED',
          resolvedAt: { lt: cutoff },
          retentionArchivedAt: null,
        },
      }),
      prisma.serviceIncidentUpdate.count({
        where: {
          incident: {
            status: 'RESOLVED',
            resolvedAt: { lt: cutoff },
            retentionArchivedAt: null,
          },
          contentRedactedAt: null,
        },
      }),
    ]);
    return {
      count: incidentCount + updateCount,
      bytes: 0n,
      oldestAt: null,
      newestAt: null,
    };
  }

  async function executeBatch(cutoff: Date) {
    // Find incidents due for archiving.
    const incidents = await prisma.serviceIncident.findMany({
      where: {
        status: 'RESOLVED',
        resolvedAt: { lt: cutoff },
        retentionArchivedAt: null,
      },
      select: { id: true, resolvedAt: true },
      orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
      take: statusIncidentBatch,
    });
    if (incidents.length === 0) {
      return {
        items: 0,
        bytes: 0n,
        refs: [],
        oldestAt: null,
        newestAt: null,
        done: true,
        failures: 0,
      };
    }

    const incidentIds = incidents.map((i) => i.id);
    const now = new Date();
    let items = 0;
    const failures = 0;

    await prisma.$transaction(async (transaction) => {
      // Redact timeline updates first.
      const updates = await transaction.serviceIncidentUpdate.findMany({
        where: {
          incidentId: { in: incidentIds },
          contentRedactedAt: null,
        },
        select: { id: true },
      });
      if (updates.length > 0) {
        const updateIds = updates.map((u) => u.id);
        await transaction.serviceIncidentUpdate.updateMany({
          where: { id: { in: updateIds } },
          data: {
            message: retentionRedactionMarker,
            authorUserId: null,
            contentRedactedAt: now,
          },
        });
        items += updates.length;
      }

      // Remove ticket links (linkedByUserId is personal data).
      await transaction.ticketIncidentLink.deleteMany({
        where: { incidentId: { in: incidentIds } },
      });

      // Remove resolution subscriptions (userId is personal data).
      await transaction.serviceIncidentSubscription.deleteMany({
        where: { incidentId: { in: incidentIds } },
      });

      // Archive the incident: redact title/author, keep the skeleton.
      await transaction.serviceIncident.updateMany({
        where: {
          id: { in: incidentIds },
          retentionArchivedAt: null,
        },
        data: {
          title: retentionRedactionMarker,
          titleEn: null,
          createdByUserId: null,
          retentionArchivedAt: now,
        },
      });
      items += incidents.length;
    });

    return {
      items,
      bytes: 0n,
      refs: [],
      oldestAt: incidents[0]?.resolvedAt ?? null,
      newestAt: incidents[incidents.length - 1]?.resolvedAt ?? null,
      done: incidents.length < statusIncidentBatch,
      failures,
    };
  }

  return { category, preview, executeBatch };
}
