import { resolveSlaNotificationRecipients } from './resolve-sla-notification-recipients';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import { findOnCallUserId } from '../../on-call/on-call-data';

jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../on-call/on-call-data', () => ({ findOnCallUserId: jest.fn() }));

const findOnCall = findOnCallUserId as jest.MockedFunction<typeof findOnCallUserId>;

function fakePrisma() {
  const audit: unknown[] = [];
  return {
    audit,
    prisma: {
      slaEscalationRule: {
        findUnique: async () => ({ targetGroupId: 'g1', targetRole: null, targetUserId: null, targetOnCall: true }),
      },
      groupMember: { findMany: async () => [{ userId: 'a' }, { userId: 'b' }] },
      $executeRaw: async () => 0,
      auditLog: { findFirst: async () => null, create: async (args: unknown) => audit.push(args) },
    },
  };
}

const input = {
  ticket: { id: 't1', assignedUserId: null, assignedGroupId: 'g1' } as never,
  event: ticketSystemEventActions.slaResponseEscalated,
  messageBody: `${ticketSystemEventActions.slaResponseEscalated}:rule-1`,
};

describe('SLA escalation to the on-call agent (Paket 2.9 K3)', () => {
  it('notifies only the current on-call agent and audits who it was', async () => {
    findOnCall.mockResolvedValueOnce('b');
    const { prisma, audit } = fakePrisma();
    expect(await resolveSlaNotificationRecipients(prisma as never, input)).toEqual(['b']);
    expect(findOnCall).toHaveBeenCalledWith(prisma, 'g1');
    expect(JSON.stringify(audit)).toContain('oncall.escalation.notified');
  });

  it('falls back to the whole group when nobody is on call', async () => {
    findOnCall.mockResolvedValueOnce(null);
    const { prisma } = fakePrisma();
    expect(await resolveSlaNotificationRecipients(prisma as never, input)).toEqual(['a', 'b']);
  });
});
