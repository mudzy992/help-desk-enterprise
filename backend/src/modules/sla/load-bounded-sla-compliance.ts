import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';
import type { SlaComplianceBreakdownRow, SlaComplianceProfileMeta, SlaComplianceProfileRow, SlaComplianceResponse, SlaComplianceWindow } from './sla-compliance.types';

export const maximumSlaComplianceProfiles = 1_000;
export const maximumSlaComplianceAggregateRows = 15_000;
export const maximumSlaComplianceResponseBytes = 4 * 1024 * 1024;

type AggregateRow = {
  kind: 'profile' | 'unit' | 'service' | 'group';
  slaProfileId: string;
  dimensionId: string | null;
  dimensionName: string | null;
  sampleCount: bigint;
  responseMet: bigint;
  resolutionMet: bigint;
};

export function supportsBoundedSlaCompliance(prisma: PrismaService): boolean {
  return typeof (prisma as unknown as { $queryRaw?: unknown }).$queryRaw === 'function';
}

export async function loadBoundedSlaCompliance(
  prisma: PrismaService,
  input: { readonly window: SlaComplianceWindow; readonly organizationalUnitIds: readonly string[] },
): Promise<SlaComplianceResponse> {
  const profiles = await prisma.slaProfile.findMany({
    select: { id: true, key: true, name: true }, orderBy: { key: 'asc' },
    take: maximumSlaComplianceProfiles + 1,
  }) as SlaComplianceProfileMeta[];
  if (profiles.length > maximumSlaComplianceProfiles) throw new SlaError('COMPLIANCE_RESOURCE_LIMIT_EXCEEDED');
  if (input.organizationalUnitIds.length === 0) return emptyResponse(profiles, input.window);
  const units = Prisma.join(input.organizationalUnitIds);
  const aggregates = await prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
    WITH eligible AS (
      SELECT s."slaProfileId", s."isResponseBreached", s."isResolutionBreached",
             t."originUnitId", ou."name" AS "originUnitName",
             t."serviceId", sv."name" AS "serviceName",
             t."assignedGroupId", g."name" AS "assignedGroupName"
      FROM "TicketSlaState" s
      JOIN "Ticket" t ON t."id" = s."ticketId"
      JOIN "OrganizationalUnit" ou ON ou."id" = t."originUnitId"
      JOIN "Service" sv ON sv."id" = t."serviceId"
      LEFT JOIN "Group" g ON g."id" = t."assignedGroupId"
      WHERE s."slaProfileId" IS NOT NULL
        AND t."originUnitId" IN (${units})
        AND t."status" IN ('RESOLVED', 'CLOSED', 'ARCHIVED')
        AND COALESCE(t."closedAt", t."resolvedAt") BETWEEN ${input.window.from} AND ${input.window.to}
    ), grouped AS (
      SELECT 'profile'::text AS kind, "slaProfileId", NULL::text AS "dimensionId", NULL::text AS "dimensionName",
             COUNT(*) AS "sampleCount", COUNT(*) FILTER (WHERE NOT "isResponseBreached") AS "responseMet",
             COUNT(*) FILTER (WHERE NOT "isResolutionBreached") AS "resolutionMet" FROM eligible GROUP BY "slaProfileId"
      UNION ALL
      SELECT 'unit', "slaProfileId", "originUnitId", "originUnitName", COUNT(*), COUNT(*) FILTER (WHERE NOT "isResponseBreached"), COUNT(*) FILTER (WHERE NOT "isResolutionBreached") FROM eligible GROUP BY "slaProfileId", "originUnitId", "originUnitName"
      UNION ALL
      SELECT 'service', "slaProfileId", "serviceId", "serviceName", COUNT(*), COUNT(*) FILTER (WHERE NOT "isResponseBreached"), COUNT(*) FILTER (WHERE NOT "isResolutionBreached") FROM eligible GROUP BY "slaProfileId", "serviceId", "serviceName"
      UNION ALL
      SELECT 'group', "slaProfileId", "assignedGroupId", "assignedGroupName", COUNT(*), COUNT(*) FILTER (WHERE NOT "isResponseBreached"), COUNT(*) FILTER (WHERE NOT "isResolutionBreached") FROM eligible GROUP BY "slaProfileId", "assignedGroupId", "assignedGroupName"
    ) SELECT * FROM grouped ORDER BY kind, "slaProfileId", "dimensionName" NULLS FIRST, "dimensionId" NULLS FIRST
      LIMIT ${maximumSlaComplianceAggregateRows + 1}
  `);
  if (aggregates.length > maximumSlaComplianceAggregateRows) throw new SlaError('COMPLIANCE_RESOURCE_LIMIT_EXCEEDED');
  const [response, resolution] = await Promise.all([
    prisma.ticketSlaState.count({ where: { isResponseBreached: true, ticket: { is: { originUnitId: { in: [...input.organizationalUnitIds] }, status: { in: ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] } } } } }),
    prisma.ticketSlaState.count({ where: { isResolutionBreached: true, ticket: { is: { originUnitId: { in: [...input.organizationalUnitIds] }, status: { in: ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] } } } } }),
  ]);
  const profileTotals = new Map(aggregates.filter((row) => row.kind === 'profile').map((row) => [row.slaProfileId, totals(row)]));
  const breakdown = (kind: AggregateRow['kind']): SlaComplianceBreakdownRow[] => aggregates.filter((row) => row.kind === kind).map((row) => ({ slaProfileId: row.slaProfileId, dimensionId: row.dimensionId, dimensionName: row.dimensionName, ...totals(row) }));
  const result: SlaComplianceResponse = {
    window: { from: input.window.from.toISOString(), to: input.window.to.toISOString() },
    profiles: profiles.map((profile): SlaComplianceProfileRow => ({ slaProfileId: profile.id, profileKey: profile.key, profileName: profile.name, ...(profileTotals.get(profile.id) ?? { sampleCount: 0, responseCompliancePercent: null, resolutionCompliancePercent: null }) })),
    byUnit: breakdown('unit'), byService: breakdown('service'), byGroup: breakdown('group'),
    openBreached: { response, resolution },
  };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maximumSlaComplianceResponseBytes) {
    throw new SlaError('COMPLIANCE_RESOURCE_LIMIT_EXCEEDED');
  }
  return result;
}

function totals(row: AggregateRow) {
  const sampleCount = Number(row.sampleCount);
  return { sampleCount, responseCompliancePercent: sampleCount === 0 ? null : Math.round(Number(row.responseMet) / sampleCount * 100), resolutionCompliancePercent: sampleCount === 0 ? null : Math.round(Number(row.resolutionMet) / sampleCount * 100) };
}

function emptyResponse(profiles: readonly SlaComplianceProfileMeta[], window: SlaComplianceWindow): SlaComplianceResponse {
  return { window: { from: window.from.toISOString(), to: window.to.toISOString() }, profiles: profiles.map((profile) => ({ slaProfileId: profile.id, profileKey: profile.key, profileName: profile.name, sampleCount: 0, responseCompliancePercent: null, resolutionCompliancePercent: null })), byUnit: [], byService: [], byGroup: [], openBreached: { response: 0, resolution: 0 } };
}
