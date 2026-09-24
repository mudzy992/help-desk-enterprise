import type { TicketRecord } from '../tickets/tickets.types';
import type { TicketSlaStateRecord } from '../sla/ticket-sla.types';

const timestamp = new Date('2026-09-10T10:00:00.000Z');

export function reportTicketSeed(
  overrides: Partial<TicketRecord> &
    Pick<TicketRecord, 'id' | 'originUnitId' | 'status'>,
): TicketRecord {
  return {
    ticketNumber: overrides.ticketNumber ?? overrides.id,
    title: overrides.title ?? 'Ticket',
    description: overrides.description ?? 'body',
    priority: overrides.priority ?? 'MEDIUM',
    impact: overrides.impact ?? 'MEDIUM',
    urgency: overrides.urgency ?? 'MEDIUM',
    classification: overrides.classification ?? 'INTERNAL',
    isConfidential: overrides.isConfidential ?? false,
    formData: null,
    serviceId: overrides.serviceId ?? 'service-vpn',
    formVersionId: overrides.formVersionId ?? 'form-vpn-v1',
    requesterId: overrides.requesterId ?? 'user-requester',
    assignedGroupId: overrides.assignedGroupId ?? null,
    assignedUserId: overrides.assignedUserId ?? null,
    parentTicketId: null,
    mergedIntoTicketId: null,
    reopenedFromTicketId: null,
    closeCodeId: overrides.closeCodeId ?? null,
    resolutionNote: overrides.resolutionNote ?? null,
    resolvedAt: overrides.resolvedAt ?? null,
    closedAt: overrides.closedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    waitingForUserEnteredAt: overrides.waitingForUserEnteredAt ?? null,
    waitingForUserReminderSentAt: null,
    firstResponseAt: overrides.firstResponseAt ?? null,
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
    ...overrides,
  };
}

export function overdueSlaState(ticketId: string): TicketSlaStateRecord {
  return {
    id: `sla-${ticketId}`,
    ticketId,
    slaProfileId: null,
    slaRuleId: null,
    responseMinutes: 60,
    resolutionMinutes: 240,
    startedAt: timestamp,
    responseDueAt: timestamp,
    resolutionDueAt: timestamp,
    respondedAt: null,
    resolutionCompletedAt: null,
    pausedAt: null,
    pausedBusinessMinutes: 0,
    isResponseBreached: false,
    isResolutionBreached: true,
    isResponseAtRisk: false,
    isResolutionAtRisk: false,
    firedEscalationKeys: [],
    // Phase 2.1: report fixtures are read, never scanned.
    nextDueAt: null,
    updatedAt: timestamp,
  };
}
