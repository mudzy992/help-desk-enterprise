import type { Prisma } from '../../../generated/prisma/client';
import type { TicketPriority, TicketStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { withTicketWhereClause } from '../../tickets/list/build-ticket-list-where';
import type {
  SlaExposureCounts,
  SlaProfileExposure,
} from './report-summary.types';

/**
 * The client's `isOpenSlaTrackedTicket`: a ticket still in flight, with a state
 * row. `ARCHIVED` is terminal there too.
 */
const openTicketStatuses: readonly TicketStatus[] = [
  'PENDING',
  'UNROUTED',
  'PENDING_APPROVAL',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
];

const ticketPriorityOrder: readonly TicketPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

type MutableExposure = {
  open: number;
  onTrack: number;
  atRisk: number;
  breached: number;
};

type SlaStateGroupRow = {
  readonly slaProfileId: string | null;
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
  readonly isResponseAtRisk: boolean;
  readonly isResolutionAtRisk: boolean;
  readonly _count: { readonly _all: number };
};

type ProfileAccumulator = {
  readonly exposure: MutableExposure;
  readonly priorities: Map<TicketPriority, MutableExposure>;
};

export type SlaSummaryCounts = {
  readonly totals: SlaExposureCounts;
  readonly profiles: readonly SlaProfileExposure[];
};

/**
 * Phase 2.4 (plan §2.4): the SLA screen's exposure numbers, counted from
 * `TicketSlaState` instead of from a page of tickets.
 *
 * One `GROUP BY` per priority (the priority lives on the ticket, the flags and
 * the profile on the state, so the two cannot be grouped in a single statement),
 * each one grouped by the four SLA flags and the profile. What comes back is one
 * row per distinct flag combination and profile — a handful, never the tickets —
 * and the visible-scope filter is the very same `where` the ticket lists use.
 */
export async function loadSlaSummaryCounts(
  prisma: PrismaService,
  input: { readonly where: Prisma.TicketWhereInput },
): Promise<SlaSummaryCounts> {
  const openTicketWhere = withTicketWhereClause(input.where, {
    status: { in: [...openTicketStatuses] },
  });
  const rowsByPriority = await Promise.all(
    ticketPriorityOrder.map((priority) =>
      prisma.ticketSlaState.groupBy({
        by: [
          'slaProfileId',
          'isResponseBreached',
          'isResolutionBreached',
          'isResponseAtRisk',
          'isResolutionAtRisk',
        ],
        where: {
          ticket: { is: withTicketWhereClause(openTicketWhere, { priority }) },
        },
        _count: { _all: true },
      }),
    ),
  );

  const totals = emptyExposure();
  const profileOrder: string[] = [];
  const byProfile = new Map<string, ProfileAccumulator>();

  rowsByPriority.forEach((rows, index) => {
    const priority = ticketPriorityOrder[index];
    for (const row of rows as readonly SlaStateGroupRow[]) {
      const bucket = exposureBucketOf(row);
      const count = row._count._all;
      addInto(totals, bucket, count);
      if (row.slaProfileId === null) {
        // A state without a profile has no row in the profile list, but it still
        // belongs to the totals.
        continue;
      }
      let profile = byProfile.get(row.slaProfileId);
      if (profile === undefined) {
        profile = { exposure: emptyExposure(), priorities: new Map() };
        byProfile.set(row.slaProfileId, profile);
        profileOrder.push(row.slaProfileId);
      }
      addInto(profile.exposure, bucket, count);
      const perPriority = profile.priorities.get(priority) ?? emptyExposure();
      addInto(perPriority, bucket, count);
      profile.priorities.set(priority, perPriority);
    }
  });

  return {
    totals,
    profiles: profileOrder.map((slaProfileId) => {
      const profile = byProfile.get(slaProfileId) as ProfileAccumulator;
      return {
        slaProfileId,
        exposure: profile.exposure,
        priorities: ticketPriorityOrder
          .filter((priority) => profile.priorities.has(priority))
          .map((priority) => ({
            priority,
            exposure: profile.priorities.get(priority) as MutableExposure,
          })),
      };
    }),
  };
}

function emptyExposure(): MutableExposure {
  return { open: 0, onTrack: 0, atRisk: 0, breached: 0 };
}

/** A breached clock wins over an at-risk one, like `isTicketSlaAtRisk` does. */
function exposureBucketOf(
  row: SlaStateGroupRow,
): keyof SlaExposureCounts {
  if (row.isResponseBreached || row.isResolutionBreached) {
    return 'breached';
  }
  if (row.isResponseAtRisk || row.isResolutionAtRisk) {
    return 'atRisk';
  }
  return 'onTrack';
}

function addInto(
  exposure: MutableExposure,
  bucket: keyof SlaExposureCounts,
  count: number,
): void {
  exposure.open += count;
  exposure[bucket] += count;
}
