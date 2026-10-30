import { empty, sqltag } from '@prisma/client/runtime/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketCsatRecord } from './csat/csat.types';
import { loadTicketCsatSubmissions } from './csat/load-ticket-csat-submissions';
import {
  loadTicketSlaSnapshots,
  toTicketSlaClientSnapshot,
} from './load-ticket-sla-snapshots';
import type { TicketSlaClientSnapshot } from './tickets.types';

/**
 * Batch fallback for records that did not come from a joined ticket-response read
 * (for example mutation responses and small test delegates). SLA and CSAT stay in
 * one `LEFT JOIN` query instead of two separate `findMany` calls. The paginated
 * list, group inbox and ticket-detail routes now select these relations alongside
 * the ticket itself using Prisma's PostgreSQL `join` strategy.
 *
 * A client without `$queryRaw` uses the two original model reads, preserving the
 * same response contract for in-memory delegates.
 */
export async function loadTicketSlaAndCsat(
  prisma: PrismaService,
  ticketIds: readonly string[],
  withCsat: boolean,
): Promise<{
  readonly sla: ReadonlyMap<string, TicketSlaClientSnapshot>;
  readonly csat: ReadonlyMap<string, TicketCsatRecord>;
}> {
  if (ticketIds.length === 0) {
    return { sla: new Map(), csat: new Map() };
  }
  if (typeof (prisma as { $queryRaw?: unknown }).$queryRaw !== 'function') {
    return {
      sla: await loadTicketSlaSnapshots(prisma, ticketIds),
      csat: withCsat
        ? await loadTicketCsatSubmissions(prisma, ticketIds)
        : new Map(),
    };
  }
  const ids = [...new Set(ticketIds)];
  const csatColumns = withCsat
    ? sqltag`, c."id" AS "csatId", c."rating" AS "csatRating", c."comment" AS "csatComment",
        c."submittedByUserId" AS "csatSubmittedByUserId", c."createdAt" AS "csatCreatedAt"`
    : empty;
  const csatJoin = withCsat
    ? sqltag`LEFT JOIN "TicketCsat" c ON c."ticketId" = t.id`
    : empty;
  const rows = await prisma.$queryRaw<SlaCsatRow[]>`
    SELECT t.id AS "ticketId",
           s."ticketId" AS "slaTicketId", s."slaProfileId", s."startedAt",
           s."responseDueAt", s."resolutionDueAt", s."respondedAt",
           s."resolutionCompletedAt", s."pausedAt", s."isResponseBreached",
           s."isResolutionBreached", s."isResponseAtRisk", s."isResolutionAtRisk"
           ${csatColumns}
    FROM unnest(${ids}::text[]) AS t(id)
    LEFT JOIN "TicketSlaState" s ON s."ticketId" = t.id
    ${csatJoin}`;
  const sla = new Map<string, TicketSlaClientSnapshot>();
  const csat = new Map<string, TicketCsatRecord>();
  for (const row of rows) {
    if (row.slaTicketId !== null && row.startedAt !== null) {
      sla.set(
        row.ticketId,
        toTicketSlaClientSnapshot({
          ticketId: row.ticketId,
          slaProfileId: row.slaProfileId,
          startedAt: toDate(row.startedAt) as Date,
          responseDueAt: toDate(row.responseDueAt),
          resolutionDueAt: toDate(row.resolutionDueAt),
          respondedAt: toDate(row.respondedAt),
          resolutionCompletedAt: toDate(row.resolutionCompletedAt),
          pausedAt: toDate(row.pausedAt),
          isResponseBreached: row.isResponseBreached === true,
          isResolutionBreached: row.isResolutionBreached === true,
          isResponseAtRisk: row.isResponseAtRisk === true,
          isResolutionAtRisk: row.isResolutionAtRisk === true,
        }),
      );
    }
    if (withCsat && row.csatId !== null && row.csatId !== undefined) {
      csat.set(row.ticketId, {
        id: row.csatId,
        ticketId: row.ticketId,
        rating: Number(row.csatRating),
        comment: row.csatComment ?? null,
        submittedByUserId: row.csatSubmittedByUserId as string,
        createdAt: toDate(row.csatCreatedAt ?? null) as Date,
      });
    }
  }
  return { sla, csat };
}

type DateLike = Date | string | null;

type SlaCsatRow = {
  readonly ticketId: string;
  readonly slaTicketId: string | null;
  readonly slaProfileId: string | null;
  readonly startedAt: DateLike;
  readonly responseDueAt: DateLike;
  readonly resolutionDueAt: DateLike;
  readonly respondedAt: DateLike;
  readonly resolutionCompletedAt: DateLike;
  readonly pausedAt: DateLike;
  readonly isResponseBreached: boolean | null;
  readonly isResolutionBreached: boolean | null;
  readonly isResponseAtRisk: boolean | null;
  readonly isResolutionAtRisk: boolean | null;
  readonly csatId?: string | null;
  readonly csatRating?: number | null;
  readonly csatComment?: string | null;
  readonly csatSubmittedByUserId?: string | null;
  readonly csatCreatedAt?: DateLike;
};

function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}
