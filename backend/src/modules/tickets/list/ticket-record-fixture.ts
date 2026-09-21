import type { TicketRecord } from '../tickets.types';

const fixtureDate = new Date('2026-01-01T00:00:00.000Z');

/** Test-support: a complete TicketRecord with only the interesting fields set. */
export function buildTicketRecord(
  overrides: Partial<TicketRecord> & { readonly id: string },
): TicketRecord {
  return {
    ticketNumber: `T-${overrides.id}`,
    title: `Ticket ${overrides.id}`,
    description: '',
    status: 'PENDING',
    priority: 'MEDIUM',
    impact: 'MEDIUM',
    urgency: 'MEDIUM',
    classification: 'INTERNAL',
    isConfidential: false,
    formData: null,
    originUnitId: 'ou-it',
    serviceId: 'service-vpn',
    formVersionId: 'form-vpn-v1',
    requesterId: 'user-requester',
    assignedGroupId: null,
    assignedUserId: null,
    parentTicketId: null,
    mergedIntoTicketId: null,
    reopenedFromTicketId: null,
    closeCodeId: null,
    resolutionNote: null,
    resolvedAt: null,
    closedAt: null,
    archivedAt: null,
    waitingForUserEnteredAt: null,
    waitingForUserReminderSentAt: null,
    firstResponseAt: null,
    createdAt: fixtureDate,
    updatedAt: fixtureDate,
    ...overrides,
  };
}
