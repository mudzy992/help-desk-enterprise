import { sqltag } from '@prisma/client/runtime/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { toUtcLiteral } from '../trends/sql-report-trend-source';
import type { ReportWindow } from '../reports.types';
import type { ReportDashboardAging } from './aggregate-report-dashboard-charts';
import type { ReportDashboardKpiTotals } from './aggregate-report-dashboard-kpis';

type NumberLike = number | string | bigint | null;

/** Everything `/reports/dashboard` needs, already aggregated in PostgreSQL. */
export type ReportsDashboardAggregates = {
  readonly ticketCount: number;
  /** Without `kbHelpedCount` — that one stays a Prisma `count`. */
  readonly kpis: Omit<ReportDashboardKpiTotals, 'kbHelpedCount'>;
  readonly groups: readonly {
    readonly key: string;
    readonly name: string | null;
    readonly totalHours: number;
    readonly count: number;
  }[];
  readonly services: readonly { readonly key: string; readonly name: string | null; readonly count: number }[];
  readonly createdByDay: ReadonlyMap<string, number>;
  readonly resolvedByDay: ReadonlyMap<string, number>;
  readonly aging: ReportDashboardAging;
};

type KpiSqlRow = {
  readonly cc: NumberLike;
  readonly cp: NumberLike;
  readonly frs: NumberLike;
  readonly frn: NumberLike;
  readonly frsp: NumberLike;
  readonly frnp: NumberLike;
  readonly rs: NumberLike;
  readonly rn: NumberLike;
  readonly rsp: NumberLike;
  readonly rnp: NumberLike;
  readonly cs: NumberLike;
  readonly cn: NumberLike;
};

type BarSqlRow = {
  readonly k: 'g' | 's';
  readonly key: string | null;
  readonly name: string | null;
  readonly h: NumberLike;
  readonly n: NumberLike;
};

type DaySqlRow = { readonly k: 'c' | 'r'; readonly d: string; readonly n: NumberLike };

type AgingSqlRow = {
  readonly total: NumberLike;
  readonly a1: NumberLike;
  readonly a3: NumberLike;
  readonly a7: NumberLike;
  readonly a8: NumberLike;
  readonly w: NumberLike;
};

const dayMs = 86_400_000;

/**
 * Paket 2.5 (design §2.2, sanacija): the reports dashboard used to read every
 * ticket of the unit into Node. These four statements return the same numbers
 * as the in-memory aggregation (`aggregate-report-dashboard-*`), which stays as
 * the reference definition and the fallback for clients without `$queryRaw`.
 *
 * Same population as before: tickets of the scoped units, not ARCHIVED
 * (merged children included, as the dashboard always counted them). Window
 * bounds are inclusive on both ends, negative durations are ignored, the
 * volume series groups by UTC calendar day.
 */
export async function loadReportsDashboardAggregates(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  window: ReportWindow,
  previousWindow: ReportWindow,
  now: Date,
): Promise<ReportsDashboardAggregates> {
  const units = [...organizationalUnitIds];
  const scope = sqltag`t."originUnitId" = ANY(${units}::text[]) AND t.status::text <> 'ARCHIVED'`;
  const from = toUtcLiteral(window.from);
  const to = toUtcLiteral(window.to);
  const previousFrom = toUtcLiteral(previousWindow.from);
  const previousTo = toUtcLiteral(previousWindow.to);
  const dayStart = Date.UTC(
    window.from.getUTCFullYear(),
    window.from.getUTCMonth(),
    window.from.getUTCDate(),
  );
  const dayEnd =
    Date.UTC(window.to.getUTCFullYear(), window.to.getUTCMonth(), window.to.getUTCDate()) + dayMs;
  const seriesFrom = toUtcLiteral(new Date(dayStart));
  const seriesTo = toUtcLiteral(new Date(dayEnd));
  const nowLiteral = toUtcLiteral(now);

  const [kpiRows, barRows, dayRows, agingRows] = await Promise.all([
    prisma.$queryRaw<KpiSqlRow[]>`
      WITH w AS (
        SELECT t."createdAt" AS c, t."firstResponseAt" AS fr, t."resolvedAt" AS r, cs.rating AS rating,
               t."createdAt" BETWEEN ${from}::timestamp(3) AND ${to}::timestamp(3) AS c_cur,
               t."createdAt" BETWEEN ${previousFrom}::timestamp(3) AND ${previousTo}::timestamp(3) AS c_prev,
               t."resolvedAt" BETWEEN ${from}::timestamp(3) AND ${to}::timestamp(3) AS r_cur,
               t."resolvedAt" BETWEEN ${previousFrom}::timestamp(3) AND ${previousTo}::timestamp(3) AS r_prev
        FROM "Ticket" t
        LEFT JOIN "TicketCsat" cs ON cs."ticketId" = t.id
        WHERE ${scope}
          AND (t."createdAt" BETWEEN ${previousFrom}::timestamp(3) AND ${to}::timestamp(3)
               OR t."resolvedAt" BETWEEN ${previousFrom}::timestamp(3) AND ${to}::timestamp(3))
      )
      SELECT count(*) FILTER (WHERE c_cur) AS cc,
             count(*) FILTER (WHERE c_prev) AS cp,
             sum(EXTRACT(EPOCH FROM fr - c) / 60) FILTER (WHERE c_cur AND fr >= c) AS frs,
             count(*) FILTER (WHERE c_cur AND fr >= c) AS frn,
             sum(EXTRACT(EPOCH FROM fr - c) / 60) FILTER (WHERE c_prev AND fr >= c) AS frsp,
             count(*) FILTER (WHERE c_prev AND fr >= c) AS frnp,
             sum(EXTRACT(EPOCH FROM r - c) / 3600) FILTER (WHERE r_cur AND r >= c) AS rs,
             count(*) FILTER (WHERE r_cur AND r >= c) AS rn,
             sum(EXTRACT(EPOCH FROM r - c) / 3600) FILTER (WHERE r_prev AND r >= c) AS rsp,
             count(*) FILTER (WHERE r_prev AND r >= c) AS rnp,
             sum(rating) FILTER (WHERE c_cur AND rating IS NOT NULL) AS cs,
             count(rating) FILTER (WHERE c_cur) AS cn
      FROM w`,
    prisma.$queryRaw<BarSqlRow[]>`
      SELECT 'g' AS k, t."assignedGroupId" AS key, g.name AS name,
             sum(EXTRACT(EPOCH FROM t."resolvedAt" - t."createdAt") / 3600) AS h, count(*) AS n
      FROM "Ticket" t
      LEFT JOIN "Group" g ON g.id = t."assignedGroupId"
      WHERE ${scope}
        AND t."resolvedAt" BETWEEN ${from}::timestamp(3) AND ${to}::timestamp(3)
        AND t."resolvedAt" >= t."createdAt"
      GROUP BY t."assignedGroupId", g.name
      UNION ALL
      SELECT 's' AS k, t."serviceId" AS key, sv.name AS name, 0 AS h, count(*) AS n
      FROM "Ticket" t
      LEFT JOIN "Service" sv ON sv.id = t."serviceId"
      WHERE ${scope}
        AND t."createdAt" BETWEEN ${from}::timestamp(3) AND ${to}::timestamp(3)
      GROUP BY t."serviceId", sv.name`,
    prisma.$queryRaw<DaySqlRow[]>`
      SELECT 'c' AS k, to_char(date_trunc('day', t."createdAt"), 'YYYY-MM-DD') AS d, count(*) AS n
      FROM "Ticket" t
      WHERE ${scope}
        AND t."createdAt" >= ${seriesFrom}::timestamp(3) AND t."createdAt" < ${seriesTo}::timestamp(3)
      GROUP BY 2
      UNION ALL
      SELECT 'r' AS k, to_char(date_trunc('day', t."resolvedAt"), 'YYYY-MM-DD') AS d, count(*) AS n
      FROM "Ticket" t
      WHERE ${scope}
        AND t."resolvedAt" >= ${seriesFrom}::timestamp(3) AND t."resolvedAt" < ${seriesTo}::timestamp(3)
      GROUP BY 2`,
    prisma.$queryRaw<AgingSqlRow[]>`
      WITH open AS (
        SELECT t.status::text AS status,
               EXTRACT(EPOCH FROM ${nowLiteral}::timestamp(3) - t."createdAt") / 86400 AS days
        FROM "Ticket" t
        WHERE ${scope}
          AND t.status::text NOT IN ('RESOLVED', 'CLOSED')
          AND t."createdAt" <= ${nowLiteral}::timestamp(3)
      )
      SELECT (SELECT count(*) FROM "Ticket" t WHERE ${scope}) AS total,
             count(*) FILTER (WHERE days < 1) AS a1,
             count(*) FILTER (WHERE days >= 1 AND days < 3) AS a3,
             count(*) FILTER (WHERE days >= 3 AND days < 7) AS a7,
             count(*) FILTER (WHERE days >= 7) AS a8,
             count(*) FILTER (WHERE days >= 7 AND status = 'WAITING_FOR_USER') AS w
      FROM open`,
  ]);

  const kpi = kpiRows[0];
  const aging = agingRows[0];
  const createdByDay = new Map<string, number>();
  const resolvedByDay = new Map<string, number>();
  for (const row of dayRows) {
    (row.k === 'c' ? createdByDay : resolvedByDay).set(row.d, toNumber(row.n));
  }
  return {
    ticketCount: toNumber(aging?.total),
    kpis: {
      createdCount: toNumber(kpi?.cc),
      previousCreatedCount: toNumber(kpi?.cp),
      firstResponse: { sum: toNumber(kpi?.frs), count: toNumber(kpi?.frn) },
      previousFirstResponse: { sum: toNumber(kpi?.frsp), count: toNumber(kpi?.frnp) },
      resolution: { sum: toNumber(kpi?.rs), count: toNumber(kpi?.rn) },
      previousResolution: { sum: toNumber(kpi?.rsp), count: toNumber(kpi?.rnp) },
      csat: { sum: toNumber(kpi?.cs), count: toNumber(kpi?.cn) },
    },
    groups: barRows
      .filter((row) => row.k === 'g')
      .map((row) => ({
        key: row.key ?? '',
        name: row.name,
        totalHours: toNumber(row.h),
        count: toNumber(row.n),
      })),
    services: barRows
      .filter((row) => row.k === 's' && row.key !== null)
      .map((row) => ({ key: row.key as string, name: row.name, count: toNumber(row.n) })),
    createdByDay,
    resolvedByDay,
    aging: {
      lessThanOneDay: toNumber(aging?.a1),
      oneToThreeDays: toNumber(aging?.a3),
      threeToSevenDays: toNumber(aging?.a7),
      moreThanSevenDays: toNumber(aging?.a8),
      waitingOverSevenDays: toNumber(aging?.w),
    },
  };
}

function toNumber(value: NumberLike | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}
