import { sqltag } from '@prisma/client/runtime/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { bottleneckStatusKeys } from '../reports.constants';
import { buildUnroutedSqlPredicate } from '../../tickets/unrouted/build-unrouted-where';
import { enumerateUtcDateKeys } from '../resolve-report-window';
import { toUtcLiteral } from '../trends/sql-report-trend-source';
import type {
  BottleneckBreakdownRow,
  BottleneckCounts,
  BottleneckDashboard,
  ReportWindow,
} from '../reports.types';

type NumberLike = number | string | bigint | null;

type CountsSqlRow = {
  readonly pa: NumberLike;
  readonly wu: NumberLike;
  readonly ur: NumberLike;
  readonly od: NumberLike;
};

type BreakdownSqlRow = CountsSqlRow & {
  /** 0 = total, 1 = unit, 2 = service, 3 = priority. */
  readonly g: NumberLike;
  readonly key: string | null;
  /** Val 1 (M15/B2): nazivi se čitaju uz same grupe (MAX zbog GROUPING SETS). */
  readonly unitName: string | null;
  readonly serviceName: string | null;
};

type TrendSqlRow = CountsSqlRow & { readonly d: string; readonly n: NumberLike };

/**
 * Paket 2.5 (design §2.2, sanacija): the bottleneck dashboard in two
 * statements instead of loading every ticket of the unit. Mirrors
 * `aggregateBottleneckDashboard` (the reference, kept for in-memory clients):
 * standing = scoped and not ARCHIVED; overdue = a breached SLA flag
 * (`isTicketSlaOverdue`); breakdowns hold only bottleneck tickets; the trend
 * groups tickets created in the window by UTC day.
 */
export async function loadBottleneckDashboardFromSql(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  window: ReportWindow,
): Promise<BottleneckDashboard> {
  const units = [...organizationalUnitIds];
  const statuses = [...bottleneckStatusKeys];
  const from = toUtcLiteral(window.from);
  const to = toUtcLiteral(window.to);
  const unroutedPredicate = buildUnroutedSqlPredicate();
  const counts = sqltag`
    count(*) FILTER (WHERE t.status::text = 'PENDING_APPROVAL') AS pa,
    count(*) FILTER (WHERE t.status::text = 'WAITING_FOR_USER') AS wu,
    count(*) FILTER (WHERE ${unroutedPredicate}) AS ur,
    count(*) FILTER (WHERE COALESCE(s."isResponseBreached" OR s."isResolutionBreached", false)) AS od`;
  const standing = sqltag`
    FROM "Ticket" t
    LEFT JOIN "TicketSlaState" s ON s."ticketId" = t.id
    LEFT JOIN "OrganizationalUnit" ou ON ou.id = t."originUnitId"
    LEFT JOIN "Service" sv ON sv.id = t."serviceId"
    WHERE t."originUnitId" = ANY(${units}::text[]) AND t.status::text <> 'ARCHIVED'`;
  const [breakdownRows, trendRows] = await Promise.all([
    prisma.$queryRaw<BreakdownSqlRow[]>`
      SELECT CASE
               WHEN GROUPING(t."originUnitId") = 0 THEN 1
               WHEN GROUPING(t."serviceId") = 0 THEN 2
               WHEN GROUPING(t.priority) = 0 THEN 3
               ELSE 0
             END AS g,
             COALESCE(t."originUnitId", t."serviceId", t.priority::text) AS key,
             MAX(ou.name) AS "unitName",
             MAX(sv.name) AS "serviceName",
             ${counts}
      ${standing}
        AND (t.status::text = ANY(${statuses}::text[])
             OR ${unroutedPredicate}
             OR COALESCE(s."isResponseBreached" OR s."isResolutionBreached", false))
      GROUP BY GROUPING SETS ((), (t."originUnitId"), (t."serviceId"), (t.priority))`,
    prisma.$queryRaw<TrendSqlRow[]>`
      SELECT to_char(date_trunc('day', t."createdAt"), 'YYYY-MM-DD') AS d, count(*) AS n, ${counts}
      ${standing}
        AND t."createdAt" BETWEEN ${from}::timestamp(3) AND ${to}::timestamp(3)
      GROUP BY 1`,
  ]);
  const breakdown = (
    group: number,
    /** Prioritet nema šifarnik, pa mu je labela sam ključ (kao u referentnoj agregaciji). */
    labelFor: (row: BreakdownSqlRow, key: string) => string = (_row, key) => key,
  ): readonly BottleneckBreakdownRow[] =>
    breakdownRows
      .filter((row) => toNumber(row.g) === group)
      .map((row) => {
        const key = row.key ?? '';
        return { key, label: labelFor(row, key), ...toCounts(row) };
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  const total = breakdownRows.find((row) => toNumber(row.g) === 0);
  const trendByDate = new Map(trendRows.map((row) => [row.d, row]));
  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    counts: total === undefined ? toCounts(null) : toCounts(total),
    byOrganizationalUnit: breakdown(1, (row, key) => row.unitName ?? key),
    byService: breakdown(2, (row, key) => row.serviceName ?? key),
    byPriority: breakdown(3),
    trend: enumerateUtcDateKeys(window).map((date) => {
      const row = trendByDate.get(date);
      return { date, createdCount: toNumber(row?.n), ...toCounts(row ?? null) };
    }),
  };
}

function toCounts(row: CountsSqlRow | null): BottleneckCounts {
  return {
    pendingApproval: toNumber(row?.pa),
    waitingForUser: toNumber(row?.wu),
    unrouted: toNumber(row?.ur),
    overdue: toNumber(row?.od),
  };
}

function toNumber(value: NumberLike | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}
