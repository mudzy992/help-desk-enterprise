import { reportCsatSatisfiedMinRating } from './report-trends.constants';
import type {
  ReportTrendCsatRow,
  ReportTrendFlowKind,
  ReportTrendFlowRow,
  ReportTrendLoadInput,
  ReportTrendRawData,
  ReportTrendServiceRow,
  ReportTrendSource,
} from './report-trends.types';

export type ReportTrendTicketFacts = {
  readonly id: string;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly assignedGroupId: string | null;
  readonly priority: string;
  readonly mergedIntoTicketId: string | null;
  readonly createdAt: Date;
  readonly firstResponseAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
};

export type ReportTrendSlaFacts = {
  readonly ticketId: string;
  readonly respondedAt: Date | null;
  readonly isResponseBreached: boolean;
  readonly resolutionCompletedAt: Date | null;
  readonly isResolutionBreached: boolean;
};

export type ReportTrendCsatFacts = {
  readonly ticketId: string;
  readonly rating: number;
  readonly createdAt: Date;
};

export type ReportTrendDataset = {
  readonly tickets: readonly ReportTrendTicketFacts[];
  readonly slaStates: readonly ReportTrendSlaFacts[];
  readonly csat: readonly ReportTrendCsatFacts[];
  readonly serviceNames: ReadonlyMap<string, string>;
};

/**
 * Paket 2.5: the reference implementation of the trend definitions (design §3),
 * row by row in TypeScript. Tests and the in-memory harness use it; the SQL
 * source is checked against it (parity script, `docs/…/2.5` §11).
 */
export class InMemoryReportTrendSource implements ReportTrendSource {
  constructor(private readonly dataset: () => ReportTrendDataset | Promise<ReportTrendDataset>) {}

  async load(input: ReportTrendLoadInput): Promise<ReportTrendRawData> {
    if (input.organizationalUnitIds.length === 0 || input.boundaries.length < 2) {
      return { flow: [], csat: [], services: [] };
    }
    const data = await this.dataset();
    const units = new Set(input.organizationalUnitIds);
    const inScope = (ticket: ReportTrendTicketFacts) =>
      units.has(ticket.originUnitId) &&
      ticket.mergedIntoTicketId === null &&
      (input.serviceId === undefined || ticket.serviceId === input.serviceId) &&
      (input.groupId === undefined || ticket.assignedGroupId === input.groupId) &&
      (input.priority === undefined || ticket.priority === input.priority);
    const bounds = input.boundaries.map((value) => value.getTime());
    const start = bounds[0] as number;
    const end = bounds[bounds.length - 1] as number;
    const bucketOf = (value: Date) => widthBucket(value.getTime(), bounds);
    const slaByTicket = new Map(data.slaStates.map((state) => [state.ticketId, state]));

    const groups = new Map<string, { kind: ReportTrendFlowKind; bucket: number; count: number; met: number; samples: number[] }>();
    const add = (kind: ReportTrendFlowKind, bucket: number, met: boolean, sample?: number) => {
      const id = `${kind}:${bucket}`;
      const group = groups.get(id) ?? { kind, bucket, count: 0, met: 0, samples: [] };
      group.count += 1;
      if (met) group.met += 1;
      if (sample !== undefined) group.samples.push(sample);
      groups.set(id, group);
    };
    for (const ticket of data.tickets) {
      if (!inScope(ticket)) continue;
      const created = ticket.createdAt.getTime();
      const doneAt = ticket.resolvedAt ?? ticket.closedAt;
      const done = doneAt === null ? null : doneAt.getTime();
      const alive = created < end && (done === null || done >= start);
      if (!alive) continue;
      if (created >= start) {
        const firstResponse = ticket.firstResponseAt?.getTime() ?? null;
        add(
          'created',
          bucketOf(ticket.createdAt),
          false,
          firstResponse !== null && firstResponse >= created ? (firstResponse - created) / 1000 : undefined,
        );
      } else {
        add('openAtStart', 0, false);
      }
      if (done !== null && done >= start && done < end) {
        add('resolved', bucketOf(doneAt as Date), false, done >= created ? (done - created) / 1000 : undefined);
      }
      const sla = slaByTicket.get(ticket.id);
      if (sla === undefined) {
        if (done !== null && done >= start && done < end) add('resolvedWithoutSla', 0, false);
        continue;
      }
      const responded = sla.respondedAt?.getTime() ?? null;
      if (responded !== null && responded >= start && responded < end) {
        add('slaResponse', bucketOf(sla.respondedAt as Date), !sla.isResponseBreached);
      }
      const completed = sla.resolutionCompletedAt?.getTime() ?? null;
      if (completed !== null && completed >= start && completed < end) {
        add('slaResolution', bucketOf(sla.resolutionCompletedAt as Date), !sla.isResolutionBreached);
      }
    }
    const flow: ReportTrendFlowRow[] = [...groups.values()].map((group) => {
      const timed = group.kind === 'created' || group.kind === 'resolved';
      const sla = group.kind === 'slaResponse' || group.kind === 'slaResolution';
      return {
        kind: group.kind,
        bucket: group.bucket,
        count: group.count,
        met: sla ? group.met : null,
        p50Seconds: timed ? percentileCont(group.samples, 0.5) : null,
        p90Seconds: timed ? percentileCont(group.samples, 0.9) : null,
        sampleCount: timed ? group.samples.length : null,
      };
    });
    if (!groups.has('openAtStart:0')) {
      flow.push({ kind: 'openAtStart', bucket: 0, count: 0, met: null, p50Seconds: null, p90Seconds: null, sampleCount: null });
    }
    if (!groups.has('resolvedWithoutSla:0')) {
      flow.push({ kind: 'resolvedWithoutSla', bucket: 0, count: 0, met: null, p50Seconds: null, p90Seconds: null, sampleCount: null });
    }

    const ticketsById = new Map(data.tickets.map((ticket) => [ticket.id, ticket]));
    const csatGroups = new Map<number, ReportTrendCsatRow>();
    for (const rating of data.csat) {
      const ticket = ticketsById.get(rating.ticketId);
      const at = rating.createdAt.getTime();
      if (ticket === undefined || !inScope(ticket) || at < start || at >= end) continue;
      const bucket = bucketOf(rating.createdAt);
      const current = csatGroups.get(bucket) ?? { bucket, count: 0, ratingSum: 0, satisfied: 0 };
      csatGroups.set(bucket, {
        bucket,
        count: current.count + 1,
        ratingSum: current.ratingSum + rating.rating,
        satisfied: current.satisfied + (rating.rating >= reportCsatSatisfiedMinRating ? 1 : 0),
      });
    }

    const previousStart = input.previous.start.getTime();
    const previousEnd = input.previous.end.getTime();
    const services = new Map<string, ReportTrendServiceRow>();
    for (const ticket of data.tickets) {
      const created = ticket.createdAt.getTime();
      if (!inScope(ticket) || created < previousStart || created >= end) continue;
      const current = services.get(ticket.serviceId) ?? {
        serviceId: ticket.serviceId,
        name: data.serviceNames.get(ticket.serviceId) ?? null,
        current: 0,
        previous: 0,
      };
      services.set(ticket.serviceId, {
        ...current,
        current: current.current + (created >= start ? 1 : 0),
        previous: current.previous + (created < previousEnd ? 1 : 0),
      });
    }
    return { flow, csat: [...csatGroups.values()], services: [...services.values()] };
  }
}

/** PostgreSQL `width_bucket(value, thresholds[])`: 1-based, 0 below the first. */
export function widthBucket(value: number, thresholds: readonly number[]): number {
  let bucket = 0;
  for (const threshold of thresholds) {
    if (value >= threshold) bucket += 1;
    else break;
  }
  return bucket;
}

/** PostgreSQL `percentile_cont` (linear interpolation); null for no samples. */
export function percentileCont(samples: readonly number[], fraction: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (position - lower);
}
