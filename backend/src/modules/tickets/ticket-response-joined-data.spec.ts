import { toTicketClientResponses } from './to-ticket-client-responses';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketResponseJoinedRecord } from './ticket-response-relations';

const now = new Date('2026-10-30T18:00:00.000Z');

function joinedTicket(): TicketResponseJoinedRecord {
  return {
    id: 'ticket-1',
    ticketNumber: 'T-1',
    title: 'Example request',
    description: 'Description',
    status: 'CLOSED',
    priority: 'NORMAL',
    impact: 'MINOR',
    urgency: 'LOW',
    classification: 'INTERNAL',
    isConfidential: false,
    formData: null,
    originUnitId: 'ou-1',
    serviceId: 'service-1',
    formVersionId: 'form-1',
    requesterId: 'user-1',
    assignedGroupId: 'group-1',
    assignedUserId: 'user-2',
    parentTicketId: 'parent-1',
    mergedIntoTicketId: null,
    reopenedFromTicketId: null,
    closeCodeId: 'close-code-1',
    resolutionNote: 'Completed',
    resolvedAt: now,
    closedAt: now,
    archivedAt: null,
    waitingForUserEnteredAt: null,
    waitingForUserReminderSentAt: null,
    firstResponseAt: now,
    createdAt: now,
    updatedAt: now,
    requester: { id: 'user-1', displayName: 'Requester One' },
    assignedUser: { id: 'user-2', displayName: 'Agent Two' },
    assignedGroup: { id: 'group-1', name: 'Support' },
    formVersion: { id: 'form-1', version: 3 },
    originUnit: { id: 'ou-1', name: 'Visoko', ouPath: '/BA/Visoko' },
    service: { id: 'service-1', name: 'Customer Support' },
    parentTicket: {
      id: 'parent-1',
      ticketNumber: 'T-PARENT',
      title: 'Confidential parent title',
      isConfidential: true,
    },
    mergedInto: null,
    closeCode: { id: 'close-code-1', key: 'resolved', name: 'Resolved' },
    slaState: {
      ticketId: 'ticket-1',
      slaProfileId: 'sla-1',
      startedAt: now,
      responseDueAt: new Date(now.getTime() + 60_000),
      resolutionDueAt: new Date(now.getTime() + 120_000),
      respondedAt: now,
      resolutionCompletedAt: now,
      pausedAt: null,
      isResponseBreached: false,
      isResolutionBreached: false,
      isResponseAtRisk: false,
      isResolutionAtRisk: false,
    },
    csat: {
      id: 'csat-1',
      ticketId: 'ticket-1',
      rating: 5,
      comment: 'Helpful',
      submittedByUserId: 'user-1',
      createdAt: now,
    },
  } as unknown as TicketResponseJoinedRecord;
}

describe('ticket response joined read data', () => {
  it('maps joined labels, SLA, CSAT and confidential parent summaries without follow-up queries', async () => {
    const prisma = new Proxy(
      {},
      {
        get() {
          throw new Error('joined response mapping must not query Prisma again');
        },
      },
    ) as PrismaService;

    const [response] = await toTicketClientResponses(prisma, [joinedTicket()], {
      reopen: { enabled: false, windowDays: 0 },
      closeCodes: { enabled: true, allowedCodes: [], requireOnResolve: true },
      csat: {
        enabled: true,
        scaleMax: 5,
        askOnResolved: true,
        askOnClosed: true,
        samplingRate: 1,
      },
      actorUserId: 'user-1',
    });

    expect(response).toMatchObject({
      requesterName: 'Requester One',
      assignedUserName: 'Agent Two',
      assignedGroupName: 'Support',
      formVersionNumber: 3,
      originUnitName: 'Visoko',
      originUnitPath: '/BA/Visoko',
      serviceName: 'Customer Support',
      parentTicketNumber: 'T-PARENT',
      parentTicketTitle: null,
      closePolicy: {
        closeCode: { key: 'resolved', name: 'Resolved' },
      },
      sla: {
        slaProfileId: 'sla-1',
        startedAt: now.toISOString(),
      },
      csat: {
        enabled: true,
        submitted: true,
        rating: 5,
        comment: 'Helpful',
      },
    });
  });
});
