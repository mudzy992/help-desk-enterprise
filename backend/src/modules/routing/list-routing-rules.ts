import { PrismaService } from '../../common/prisma/prisma.service';
import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';
import { routingListDefaultTake, routingListMaximumTake } from './routing.constants';
import {
  decodeRoutingRuleCursor,
  encodeRoutingListCursor,
} from './routing-list-cursor';
import type { ListRoutingRulesQuery, RoutingRuleRecord } from './routing.types';

export type RoutingReadScopeAssignment = {
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
};

export type RoutingRuleRecordPage = {
  readonly items: readonly RoutingRuleRecord[];
  readonly total: number;
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export async function listRoutingRules(
  prisma: PrismaService,
  query: ListRoutingRulesQuery,
  assignments?: readonly RoutingReadScopeAssignment[],
): Promise<RoutingRuleRecordPage> {
  const take = Math.min(
    routingListMaximumTake,
    Math.max(1, query.take ?? routingListDefaultTake),
  );
  const cursor = decodeRoutingRuleCursor(query.cursor);
  const units = assignments === undefined || isGlobal(assignments)
    ? null
    : await prisma.organizationalUnit.findMany({
        select: { id: true, ouPath: true },
      });
  const scopedAssignments = assignments ?? [];
  const allowedPairs = units === null
    ? null
    : scopedAssignments.flatMap((assignment) =>
        units
          .filter((unit) => doesOrganizationalUnitScopeCover({
            assignedPath: assignment.organizationalUnitPath,
            requestedPath: unit.ouPath,
          }))
          .map((unit) => ({
            originUnitId: unit.id,
            serviceId: assignment.serviceId,
          })),
      );
  const scopeWhere = allowedPairs === null
    ? {}
    : {
        OR: allowedPairs.map((pair) => ({
          originUnitId: pair.originUnitId,
          ...(pair.serviceId === null ? {} : { serviceId: pair.serviceId }),
        })),
      };
  const filterWhere = {
    ...scopeWhere,
    ...(query.originUnitId === undefined ? {} : { originUnitId: query.originUnitId }),
    ...(query.serviceId === undefined ? {} : { serviceId: query.serviceId }),
  };
  const pageWhere = cursor === null
    ? filterWhere
    : {
        AND: [
          filterWhere,
          {
            OR: [
              { serviceId: { gt: cursor.serviceId } },
              {
                serviceId: cursor.serviceId,
                originUnitId: { gt: cursor.originUnitId },
              },
              {
                serviceId: cursor.serviceId,
                originUnitId: cursor.originUnitId,
                id: { gt: cursor.id },
              },
            ],
          },
        ],
      };
  const [total, rows] = await Promise.all([
    prisma.routingRule.count({ where: filterWhere }),
    prisma.routingRule.findMany({
      where: pageWhere,
      orderBy: [
        { serviceId: 'asc' },
        { originUnitId: 'asc' },
        { id: 'asc' },
      ],
      take: take + 1,
    }),
  ]);
  const hasMore = rows.length > take;
  const items = rows.slice(0, take);
  const last = items[items.length - 1];
  return {
    items,
    total,
    take,
    cursor: query.cursor ?? null,
    nextCursor: hasMore && last !== undefined
      ? encodeRoutingListCursor({
          kind: 'rule',
          serviceId: last.serviceId,
          originUnitId: last.originUnitId,
          id: last.id,
        })
      : null,
    hasMore,
  };
}

export async function resolveRoutingScopePairs(
  prisma: PrismaService,
  assignments: readonly RoutingReadScopeAssignment[],
): Promise<readonly { readonly originUnitId: string; readonly serviceId: string | null }[] | null> {
  if (isGlobal(assignments)) return null;
  const units = await prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  return assignments.flatMap((assignment) =>
    units
      .filter((unit) => doesOrganizationalUnitScopeCover({
        assignedPath: assignment.organizationalUnitPath,
        requestedPath: unit.ouPath,
      }))
      .map((unit) => ({
        originUnitId: unit.id,
        serviceId: assignment.serviceId,
      })),
  );
}

export async function loadVisibleRoutingRuleIds(
  prisma: PrismaService,
  assignments: readonly RoutingReadScopeAssignment[],
): Promise<readonly string[] | null> {
  const pairs = await resolveRoutingScopePairs(prisma, assignments);
  if (pairs === null) return null;
  const rules = await prisma.routingRule.findMany({
    where: {
      OR: pairs.map((pair) => ({
        originUnitId: pair.originUnitId,
        ...(pair.serviceId === null ? {} : { serviceId: pair.serviceId }),
      })),
    },
    select: { id: true },
  });
  return rules.map((rule) => rule.id);
}

function isGlobal(assignments: readonly RoutingReadScopeAssignment[]): boolean {
  return assignments.some(
    (assignment) =>
      assignment.organizationalUnitPath === null && assignment.serviceId === null,
  );
}
