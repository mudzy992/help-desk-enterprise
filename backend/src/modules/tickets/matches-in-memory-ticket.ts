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
    matchesScalarOrIn(ticket.id, where.id) &&
    matchesScalar(ticket.originUnitId, where.originUnitId) &&
    matchesScalar(ticket.serviceId, where.serviceId) &&
    matchesScalar(ticket.requesterId, where.requesterId) &&
    matchesStatus(ticket.status, where.status) &&
    matchesAssignedGroupId(ticket.assignedGroupId, where.assignedGroupId) &&
    matchesAssignedUserId(ticket.assignedUserId, where.assignedUserId) &&
    matchesNullable(ticket.parentTicketId, where.parentTicketId) &&
    matchesNullable(ticket.mergedIntoTicketId, where.mergedIntoTicketId) &&
    matchesClosedAt(ticket.closedAt, where.closedAt)
  );
}

function matchesScalar(value: string, expected?: string): boolean {
  return expected === undefined || value === expected;
}

function matchesScalarOrIn(
  value: string,
  expected?: string | { in: readonly string[] },
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected === 'string') {
    return value === expected;
  }
  return expected.in.includes(value);
}

function matchesNullable(
  value: string | null,
  expected?: string | null,
): boolean {
  return expected === undefined || value === expected;
}

function matchesStatus(
  status: string,
  expected?: string | { in: readonly string[] } | { not: string },
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected === 'string') {
    return status === expected;
  }
  if ('not' in expected) {
    return status !== expected.not;
  }
  return expected.in.includes(status);
}

function matchesClosedAt(
  actual: Date | null,
  expected?: { lte: Date },
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (actual === null) {
    return false;
  }
  return actual.getTime() <= expected.lte.getTime();
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
