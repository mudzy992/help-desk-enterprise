import type { Prisma } from '../../../generated/prisma/client';
import type { TicketStatus } from '../../../generated/prisma/enums';
import type { TicketListQuery } from './list-tickets.types';

function toStatusArray(
  status: TicketListQuery['status'],
): readonly TicketStatus[] {
  if (status === undefined) {
    return [];
  }
  return typeof status === 'string' ? [status] : status;
}

/**
 * Status narrowing. `null` means nothing can match (an archive-only request
 * from someone who may not search the archive). Without an explicit status the
 * archive stays hidden unless `includeArchived` is set.
 */
export function buildTicketStatusFilter(
  query: TicketListQuery,
  canSearchArchive: boolean,
): Prisma.TicketWhereInput | null {
  const requested = toStatusArray(query.status);
  if (requested.length > 0) {
    const allowed = canSearchArchive
      ? requested
      : requested.filter((status) => status !== 'ARCHIVED');
    if (allowed.length === 0) {
      return null;
    }
    return allowed.length === 1
      ? { status: allowed[0] }
      : { status: { in: [...allowed] } };
  }
  return query.includeArchived === true ? {} : { status: { not: 'ARCHIVED' } };
}

const overdueState: Prisma.TicketSlaStateWhereInput = {
  OR: [{ isResponseBreached: true }, { isResolutionBreached: true }],
};

// Mirrors isTicketSlaAtRisk: a breached ticket is overdue, never "at risk".
const atRiskState: Prisma.TicketSlaStateWhereInput = {
  isResponseBreached: false,
  isResolutionBreached: false,
  OR: [{ isResponseAtRisk: true }, { isResolutionAtRisk: true }],
};

/** Narrowing filters, combined with AND. Excludes status and visibility. */
export function buildTicketListFilters(
  query: TicketListQuery,
): Prisma.TicketWhereInput[] {
  const clauses: Prisma.TicketWhereInput[] = [];
  if (query.originUnitId !== undefined) {
    clauses.push({ originUnitId: query.originUnitId });
  }
  if (query.serviceId !== undefined) {
    clauses.push({ serviceId: query.serviceId });
  }
  if (query.assignedUserId !== undefined) {
    clauses.push({ assignedUserId: query.assignedUserId });
  }
  if (query.priority !== undefined) {
    clauses.push({ priority: query.priority });
  }
  if (query.requesterId !== undefined) {
    clauses.push({ requesterId: query.requesterId });
  }
  if (query.groupId !== undefined) {
    clauses.push({ assignedGroupId: query.groupId });
  }
  if (query.unassigned === true) {
    clauses.push({ assignedUserId: null });
  }
  if (query.createdFrom !== undefined || query.createdTo !== undefined) {
    clauses.push({
      createdAt: {
        ...(query.createdFrom === undefined
          ? {}
          : { gte: new Date(query.createdFrom) }),
        ...(query.createdTo === undefined
          ? {}
          : { lte: new Date(query.createdTo) }),
      },
    });
  }
  if (query.overdue === true) {
    clauses.push({ slaState: { is: overdueState } });
  }
  if (query.atRisk === true) {
    clauses.push({ slaState: { is: atRiskState } });
  }
  const search = buildTicketSearchFilter(query);
  if (search !== null) {
    clauses.push(search);
  }
  return clauses;
}

function buildTicketSearchFilter(
  query: TicketListQuery,
): Prisma.TicketWhereInput | null {
  const needle = query.q?.trim() ?? '';
  if (needle.length === 0) {
    return null;
  }
  const contains = { contains: needle, mode: 'insensitive' as const };
  const alternatives: Prisma.TicketWhereInput[] = [
    { ticketNumber: contains },
    { title: contains },
  ];
  if (query.searchDescription === true) {
    alternatives.push({ description: contains });
  }
  return { OR: alternatives };
}
