import { getTicket } from './get-ticket';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketResponseJoinedRecord } from './ticket-response-relations';

const ticket = {
  id: 'ticket-1',
  ticketNumber: 'T-1',
  title: 'Visible request',
  description: 'Description',
  status: 'PENDING',
  priority: 'NORMAL',
  impact: 'MINOR',
  urgency: 'LOW',
  classification: 'INTERNAL',
  isConfidential: false,
  formData: null,
  originUnitId: 'ou-1',
  serviceId: 'service-1',
  formVersionId: null,
  requesterId: 'user-1',
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
  createdAt: new Date('2026-10-30T18:00:00.000Z'),
  updatedAt: new Date('2026-10-30T18:00:00.000Z'),
  originUnit: { id: 'ou-1', name: 'Visoko', ouPath: '/BA/Visoko' },
} as unknown as TicketResponseJoinedRecord;

describe('getTicket joined response read', () => {
  it('uses the joined origin-unit path instead of issuing a second lookup', async () => {
    const findUnique = jest.fn().mockResolvedValue(ticket);
    const findMany = jest.fn();
    const prisma = {
      ticket: { findUnique },
      organizationalUnit: { findMany },
    } as unknown as PrismaService;
    const authorizationContextLoader = {
      loadBySubjectId: jest.fn().mockResolvedValue({
        subjectId: 'user-1',
        isSuperAdmin: false,
        assignments: [],
      }),
    };

    await expect(
      getTicket(
        prisma,
        authorizationContextLoader as never,
        'ticket-1',
        { actorUserId: 'user-1' },
        { withResponseRelations: true },
      ),
    ).resolves.toBe(ticket);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ relationLoadStrategy: 'join' }),
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
