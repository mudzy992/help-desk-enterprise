import { createInMemoryTicketsPrisma } from '../create-in-memory-tickets-prisma';
import { defaultTicketGuardrailsConfiguration } from './guardrails.constants';
import { findDuplicateTickets } from './find-duplicate-tickets';
import { vpnCreateInput } from '../vpn-create-input';
import { ticketsTestIds } from '../tickets-test-ids';
import type { TicketRecord } from '../tickets.types';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('findDuplicateTickets window', () => {
  it('ignores similar tickets outside the duplicate window', async () => {
    const memory = createInMemoryTicketsPrisma();
    const now = new Date('2026-09-11T12:05:00.000Z');
    const stale: TicketRecord = {
      id: 'old',
      ticketNumber: 'T-000001',
      title: 'VPN is down',
      description: vpnCreateInput().description,
      status: 'PENDING',
      priority: 'HIGH',
      impact: 'MEDIUM',
      urgency: 'HIGH',
      classification: 'INTERNAL',
      isConfidential: false,
      formData: null,
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      formVersionId: ticketsTestIds.formVpnV1,
      requesterId: ticketsTestIds.requester,
      assignedGroupId: null,
      assignedUserId: null,
      parentTicketId: null,
      mergedIntoTicketId: null,
      reopenedFromTicketId: null,
      closeCodeId: null,
      resolutionNote: null,
      resolvedAt: null,
      closedAt: null,
      waitingForUserEnteredAt: null,
      waitingForUserReminderSentAt: null,
      createdAt: new Date('2026-09-11T11:00:00.000Z'),
      updatedAt: new Date('2026-09-11T11:00:00.000Z'),
    };
    memory.tickets.set(stale.id, stale);
    const matches = await findDuplicateTickets({
      prisma: memory.prisma as never,
      configuration: defaultTicketGuardrailsConfiguration,
      requesterId: ticketsTestIds.requester,
      serviceId: ticketsTestIds.serviceVpn,
      description: stale.description,
      now,
    });
    expect(matches).toEqual([]);
  });
});
