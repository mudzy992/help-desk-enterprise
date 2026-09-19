import type { TicketRecord } from '../tickets.types';
import type { TicketExportLabels } from './load-ticket-export-labels';
import type { TicketExportRow } from './export.types';

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function buildTicketExportRows(input: {
  readonly tickets: readonly TicketRecord[];
  readonly labels: TicketExportLabels;
  readonly unitLabelById: ReadonlyMap<string, string>;
  readonly overdueByTicketId: ReadonlyMap<string, boolean>;
}): readonly TicketExportRow[] {
  return input.tickets.map((ticket) => ({
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    impact: ticket.impact,
    urgency: ticket.urgency,
    service: input.labels.services.get(ticket.serviceId) ?? '',
    originUnit: input.unitLabelById.get(ticket.originUnitId) ?? '',
    handlerGroup:
      ticket.assignedGroupId === null
        ? ''
        : (input.labels.groups.get(ticket.assignedGroupId) ?? ''),
    assignee:
      ticket.assignedUserId === null
        ? ''
        : (input.labels.users.get(ticket.assignedUserId) ?? ''),
    requester: input.labels.users.get(ticket.requesterId) ?? '',
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: toIso(ticket.resolvedAt),
    closedAt: toIso(ticket.closedAt),
    slaOverdue: input.overdueByTicketId.get(ticket.id) === true ? 'yes' : 'no',
  }));
}
