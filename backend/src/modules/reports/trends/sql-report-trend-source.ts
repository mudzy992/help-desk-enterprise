import { Injectable } from '@nestjs/common';
import { empty, sqltag } from '@prisma/client/runtime/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  ReportTrendCsatRow,
  ReportTrendFlowKind,
  ReportTrendFlowRow,
  ReportTrendLoadInput,
  ReportTrendRawData,
  ReportTrendServiceRow,
  ReportTrendSource,
} from './report-trends.types';

type NumberLike = number | string | bigint | null;

type FlowSqlRow = {
  readonly k: ReportTrendFlowKind;
  readonly i: NumberLike;
  readonly n: NumberLike;
  readonly m: NumberLike;
  readonly q: readonly NumberLike[] | null;
  readonly qn: NumberLike;
};

type CsatSqlRow = { readonly i: NumberLike; readonly n: NumberLike; readonly s: NumberLike; readonly ok: NumberLike };
type ServiceSqlRow = {
  readonly serviceId: string;
  readonly name: string | null;
  readonly cur: NumberLike;
  readonly prev: NumberLike;
};

/**
 * Paket 2.5 (design §4): trend aggregates in PostgreSQL — three statements,
 * no ticket rows leave the database.
 *
 * 1. Flow: one scan of the tickets that were alive in the range (created before
 *    its end, not resolved before its start), joined to their SLA state, then
 *    bucketed with `width_bucket` over the bucket boundaries computed in
 *    `buildReportTrendBuckets` (the time zone never reaches SQL).
 *    „Riješen” = COALESCE(resolvedAt, closedAt); merged children are left out.
 *    Backlog at a bucket end = open at range start + Σ(created − resolved).
 * 2. CSAT: ratings given in the range, by the rating's own date.
 * 3. Services: created per service in the range and in the previous period.
 *
 * Timestamps are sent as UTC `timestamp(3)` literals: the columns are
 * `timestamp without time zone` holding UTC, so no session zone applies.
 */
@Injectable()
export class SqlReportTrendSource implements ReportTrendSource {
  constructor(private readonly prisma: PrismaService) {}

  async load(input: ReportTrendLoadInput): Promise<ReportTrendRawData> {
    if (input.organizationalUnitIds.length === 0 || input.boundaries.length < 2) {
      return { flow: [], csat: [], services: [] };
    }
    const thresholds = input.boundaries.map(toUtcLiteral);
    const rangeStart = thresholds[0] as string;
    const rangeEnd = thresholds[thresholds.length - 1] as string;
    const scope = scopeClause(input);
    const [flow, csat, services] = await Promise.all([
      this.prisma.$queryRaw<FlowSqlRow[]>`
        WITH scoped AS MATERIALIZED (
          SELECT t."createdAt" AS c,
                 t."firstResponseAt" AS fr,
                 COALESCE(t."resolvedAt", t."closedAt") AS d,
                 s."ticketId" IS NOT NULL AS has_sla,
                 s."respondedAt" AS sr,
                 s."isResponseBreached" AS srb,
                 s."resolutionCompletedAt" AS sc,
                 s."isResolutionBreached" AS scb
          FROM "Ticket" t
          LEFT JOIN "TicketSlaState" s ON s."ticketId" = t.id
          WHERE ${scope}
            AND t."createdAt" < ${rangeEnd}::timestamp(3)
            AND (COALESCE(t."resolvedAt", t."closedAt") IS NULL
                 OR COALESCE(t."resolvedAt", t."closedAt") >= ${rangeStart}::timestamp(3))
        )
        SELECT 'created' AS k, width_bucket(c, ${thresholds}::timestamp(3)[]) AS i,
               count(*)::int AS n, NULL::int AS m,
               percentile_cont(ARRAY[0.5, 0.9]::float8[]) WITHIN GROUP (ORDER BY extract(epoch FROM fr - c))
                 FILTER (WHERE fr >= c) AS q,
               count(*) FILTER (WHERE fr >= c)::int AS qn
          FROM scoped WHERE c >= ${rangeStart}::timestamp(3) GROUP BY 2
        UNION ALL
        SELECT 'resolved', width_bucket(d, ${thresholds}::timestamp(3)[]), count(*)::int, NULL,
               percentile_cont(ARRAY[0.5, 0.9]::float8[]) WITHIN GROUP (ORDER BY extract(epoch FROM d - c))
                 FILTER (WHERE d >= c),
               count(*) FILTER (WHERE d >= c)::int
          FROM scoped WHERE d >= ${rangeStart}::timestamp(3) AND d < ${rangeEnd}::timestamp(3) GROUP BY 2
        UNION ALL
        SELECT 'openAtStart', 0, count(*)::int, NULL, NULL, NULL
          FROM scoped WHERE c < ${rangeStart}::timestamp(3)
        UNION ALL
        SELECT 'slaResponse', width_bucket(sr, ${thresholds}::timestamp(3)[]), count(*)::int,
               count(*) FILTER (WHERE NOT srb)::int, NULL, NULL
          FROM scoped WHERE sr >= ${rangeStart}::timestamp(3) AND sr < ${rangeEnd}::timestamp(3) GROUP BY 2
        UNION ALL
        SELECT 'slaResolution', width_bucket(sc, ${thresholds}::timestamp(3)[]), count(*)::int,
               count(*) FILTER (WHERE NOT scb)::int, NULL, NULL
          FROM scoped WHERE sc >= ${rangeStart}::timestamp(3) AND sc < ${rangeEnd}::timestamp(3) GROUP BY 2
        UNION ALL
        SELECT 'resolvedWithoutSla', 0, count(*)::int, NULL, NULL, NULL
          FROM scoped WHERE NOT has_sla AND d >= ${rangeStart}::timestamp(3) AND d < ${rangeEnd}::timestamp(3)`,
      this.prisma.$queryRaw<CsatSqlRow[]>`
        SELECT width_bucket(r."createdAt", ${thresholds}::timestamp(3)[]) AS i,
               count(*)::int AS n,
               sum(r.rating)::int AS s,
               count(*) FILTER (WHERE r.rating >= ${input.csatSatisfiedMinRating})::int AS ok
        FROM "TicketCsat" r
        JOIN "Ticket" t ON t.id = r."ticketId"
        WHERE ${scope}
          AND r."createdAt" >= ${rangeStart}::timestamp(3)
          AND r."createdAt" < ${rangeEnd}::timestamp(3)
        GROUP BY 1`,
      this.prisma.$queryRaw<ServiceSqlRow[]>`
        SELECT t."serviceId" AS "serviceId", max(sv.name) AS name,
               count(*) FILTER (WHERE t."createdAt" >= ${rangeStart}::timestamp(3))::int AS cur,
               count(*) FILTER (WHERE t."createdAt" < ${toUtcLiteral(input.previous.end)}::timestamp(3))::int AS prev
        FROM "Ticket" t
        LEFT JOIN "Service" sv ON sv.id = t."serviceId"
        WHERE ${scope}
          AND t."createdAt" >= ${toUtcLiteral(input.previous.start)}::timestamp(3)
          AND t."createdAt" < ${rangeEnd}::timestamp(3)
        GROUP BY t."serviceId"`,
    ]);
    return {
      flow: flow.map(toFlowRow),
      csat: csat.map(
        (row): ReportTrendCsatRow => ({
          bucket: toNumber(row.i),
          count: toNumber(row.n),
          ratingSum: toNumber(row.s),
          satisfied: toNumber(row.ok),
        }),
      ),
      services: services.map(
        (row): ReportTrendServiceRow => ({
          serviceId: row.serviceId,
          name: row.name,
          current: toNumber(row.cur),
          previous: toNumber(row.prev),
        }),
      ),
    };
  }
}

function scopeClause(input: ReportTrendLoadInput) {
  const units = [...input.organizationalUnitIds];
  return sqltag`t."originUnitId" = ANY(${units}::text[])
    AND t."mergedIntoTicketId" IS NULL
    ${input.serviceId === undefined ? empty : sqltag`AND t."serviceId" = ${input.serviceId}`}
    ${input.groupId === undefined ? empty : sqltag`AND t."assignedGroupId" = ${input.groupId}`}
    ${input.priority === undefined ? empty : sqltag`AND t.priority = ${input.priority}::"TicketPriority"`}`;
}

function toFlowRow(row: FlowSqlRow): ReportTrendFlowRow {
  const quantiles = row.q ?? null;
  return {
    kind: row.k,
    bucket: toNumber(row.i),
    count: toNumber(row.n),
    met: row.m === null ? null : toNumber(row.m),
    p50Seconds: quantiles === null || quantiles[0] === null ? null : toNumber(quantiles[0] ?? null),
    p90Seconds: quantiles === null || quantiles[1] === null ? null : toNumber(quantiles[1] ?? null),
    sampleCount: row.qn === null ? null : toNumber(row.qn),
  };
}

function toNumber(value: NumberLike | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

/** `2026-09-27 08:00:00.000` — UTC wall clock, matching the column type. */
export function toUtcLiteral(value: Date): string {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}
