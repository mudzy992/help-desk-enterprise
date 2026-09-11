import { describeTicketReopen, resolveTicketReopenPolicy } from './resolve-ticket-reopen-policy';
import { defaultTicketReopenConfiguration } from './reopen.constants';
import type { TicketRecord } from '../tickets.types';

const resolvedAt = new Date('2026-09-01T12:00:00.000Z');

function ticket(status: TicketRecord['status']): TicketRecord {
  return {
    id: 'ticket-1',
    ticketNumber: 'T-000001',
    title: 'VPN',
    description: 'down',
    status,
    priority: 'HIGH',
    impact: 'HIGH',
    urgency: 'MEDIUM',
    classification: 'INTERNAL',
    isConfidential: false,
    formData: null,
    originUnitId: 'ou-1',
    serviceId: 'svc-1',
    formVersionId: 'form-1',
    requesterId: 'user-1',
    assignedGroupId: 'group-1',
    assignedUserId: 'agent-1',
    reopenedFromTicketId: null,
    parentTicketId: null,
    mergedIntoTicketId: null,
    closeCodeId: null,
    resolutionNote: null,
    resolvedAt: status === 'PENDING' ? null : resolvedAt,
    closedAt: status === 'CLOSED' ? resolvedAt : null,
    waitingForUserEnteredAt: null,
    waitingForUserReminderSentAt: null,
    archivedAt: null,
    createdAt: resolvedAt,
    updatedAt: resolvedAt,
  };
}

describe('resolveTicketReopenPolicy', () => {
  it('reopens the same ticket inside the window and a new ticket after it', () => {
    const inside = resolveTicketReopenPolicy({
      ticket: ticket('RESOLVED'),
      configuration: defaultTicketReopenConfiguration,
      now: new Date('2026-09-08T12:00:00.000Z'),
    });
    expect(inside).toMatchObject({
      enabled: true,
      eligible: true,
      createsNewTicket: false,
      mode: 'same_ticket',
    });
    const after = resolveTicketReopenPolicy({
      ticket: ticket('CLOSED'),
      configuration: defaultTicketReopenConfiguration,
      now: new Date('2026-09-08T12:00:00.001Z'),
    });
    expect(after.createsNewTicket).toBe(true);
    expect(after.mode).toBe('new_ticket');
  });

  it('is ineligible when disabled, archived, or missing resolve/close timestamps', () => {
    expect(
      describeTicketReopen(
        ticket('PENDING'),
        defaultTicketReopenConfiguration,
        new Date('2026-09-02T12:00:00.000Z'),
      ).eligible,
    ).toBe(false);
    expect(
      resolveTicketReopenPolicy({
        ticket: ticket('RESOLVED'),
        configuration: { enabled: false, windowDays: 7 },
        now: new Date('2026-09-02T12:00:00.000Z'),
      }).eligible,
    ).toBe(false);
  });
});
