import { resolveApprovalNotificationRecipients } from './resolve-approval-notification-recipients';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketApprovalsConfiguration } from '../../tickets/approvals/approvals.types';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type Assignment = {
  readonly userId: string;
  readonly serviceId: string | null;
  readonly organizationalUnit: { ouPath: string | null } | null;
};

function fakePrisma(input: {
  readonly ouPath?: string | null;
  readonly assignments?: readonly Assignment[];
  readonly participants?: readonly string[];
  readonly groupMembers?: readonly string[];
}) {
  return {
    organizationalUnit: {
      findUnique: async () =>
        input.ouPath === undefined ? null : { ouPath: input.ouPath },
    },
    userRole: { findMany: async () => input.assignments ?? [] },
    ticketParticipant: {
      findMany: async () =>
        (input.participants ?? []).map((userId) => ({ userId })),
    },
    groupMember: {
      findMany: async () =>
        (input.groupMembers ?? []).map((userId) => ({ userId })),
    },
  } as never;
}

const ticket = {
  id: 'ticket-1',
  originUnitId: 'ou-b',
  serviceId: 'svc-1',
  requesterId: 'requester-1',
  assignedGroupId: 'group-1',
} as never;

const adminConfiguration: TicketApprovalsConfiguration = {
  enabled: true,
  requiredByService: {},
  defaultApproverRole: 'ADMIN',
  allowRequesterManager: false,
};

describe('resolveApprovalNotificationRecipients (val 2, M9/B1)', () => {
  it('šalje zahtjev za odobrenje odobravaocima u OU/servis scope-u', async () => {
    const prisma = fakePrisma({
      ouPath: 'OU/IT',
      assignments: [
        // Pokriva podređenu jedinicu, bez servisnog ograničenja.
        { userId: 'admin-it', serviceId: null, organizationalUnit: { ouPath: 'OU' } },
        // Ista rola, ali van jedinice tiketa.
        { userId: 'admin-other', serviceId: null, organizationalUnit: { ouPath: 'OU/HR' } },
        // Bez OU dodele (null ne pokriva ništa) — tretira se kao bez scope-a.
        { userId: 'admin-no-scope', serviceId: null, organizationalUnit: null },
        // Sukob: dodela je vezana na drugi servis.
        { userId: 'admin-other-service', serviceId: 'svc-2', organizationalUnit: { ouPath: 'OU' } },
      ],
      participants: ['approver-participant'],
    });

    await expect(
      resolveApprovalNotificationRecipients(prisma, {
        ticket,
        event: ticketSystemEventActions.approvalRequested,
        configuration: adminConfiguration,
      }),
    ).resolves.toEqual(['admin-it', 'approver-participant']);
  });

  it('pada na grupu tiketa kad nijedan odobravalac ne pokriva scope', async () => {
    const prisma = fakePrisma({
      ouPath: 'OU/IT',
      assignments: [],
      groupMembers: ['agent-1', 'agent-2'],
    });

    await expect(
      resolveApprovalNotificationRecipients(prisma, {
        ticket,
        event: ticketSystemEventActions.approvalRequested,
        configuration: adminConfiguration,
      }),
    ).resolves.toEqual(['agent-1', 'agent-2']);
  });

  it('odluku vraća naručiocu, ne odobravaocima', async () => {
    const prisma = fakePrisma({
      ouPath: 'OU/IT',
      assignments: [
        { userId: 'admin-it', serviceId: null, organizationalUnit: { ouPath: 'OU' } },
      ],
      participants: ['approver-participant'],
    });

    await expect(
      resolveApprovalNotificationRecipients(prisma, {
        ticket,
        event: ticketSystemEventActions.approvalApproved,
        configuration: adminConfiguration,
      }),
    ).resolves.toEqual(['requester-1', 'approver-participant']);
  });

  it('poštuje rolu AGENT iz konfiguracije i ne šalje kad su odobrenja isključena', async () => {
    const prisma = fakePrisma({
      ouPath: 'OU/IT',
      assignments: [
        { userId: 'agent-it', serviceId: null, organizationalUnit: { ouPath: 'OU/IT' } },
      ],
    });

    await expect(
      resolveApprovalNotificationRecipients(prisma, {
        ticket,
        event: ticketSystemEventActions.approvalRequested,
        configuration: { ...adminConfiguration, defaultApproverRole: 'AGENT' },
      }),
    ).resolves.toEqual(['agent-it']);

    // Isključena odobrenja: nema kandidata; bez grupe → nema primaoca (i to je
    // ispravno, jer tiket tada ne bi ni bio u PENDING_APPROVAL).
    await expect(
      resolveApprovalNotificationRecipients(fakePrisma({ ouPath: 'OU/IT' }), {
        ticket,
        event: ticketSystemEventActions.approvalRequested,
        configuration: { ...adminConfiguration, enabled: false },
      }),
    ).resolves.toEqual([]);
  });
});
