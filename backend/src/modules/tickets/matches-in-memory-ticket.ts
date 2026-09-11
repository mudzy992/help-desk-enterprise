import type { TicketRecord } from './tickets.types';
import type { InMemoryTicketWhere } from './in-memory-ticket-where';

export function matchesInMemoryTicket(
  ticket: TicketRecord,
  where?: InMemoryTicketWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  return (
    matchesScalar(ticket.id, where.id) &&
    matchesScalar(ticket.originUnitId, where.originUnitId) &&
    matchesScalar(ticket.serviceId, where.serviceId) &&
    matchesScalar(ticket.requesterId, where.requesterId) &&
    matchesStatus(ticket.status, where.status) &&
    matchesAssignedGroupId(ticket.assignedGroupId, where.assignedGroupId) &&
    matchesAssignedUserId(ticket.assignedUserId, where.assignedUserId)
  );
}

function matchesScalar(value: string, expected?: string): boolean {
  return expected === undefined || value === expected;
}

function matchesStatus(
  status: string,
  expected?: string | { in: readonly string[] },
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected === 'string') {
    return status === expected;
  }
  return expected.in.includes(status);
}

function matchesAssignedGroupId(
  assignedGroupId: string | null,
  expected?: string | { in: readonly string[] } | { not: null },
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected === 'string') {
    return assignedGroupId === expected;
  }
  if ('not' in expected) {
    return assignedGroupId !== null;
  }
  return assignedGroupId !== null && expected.in.includes(assignedGroupId);
}

function matchesAssignedUserId(
  assignedUserId: string | null,
  expected?: string | null | { not: null },
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (expected !== null && typeof expected === 'object' && 'not' in expected) {
    return assignedUserId !== null;
  }
  return assignedUserId === expected;
}
