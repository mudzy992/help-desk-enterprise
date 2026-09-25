import { createEmailChannelTestConfiguration } from './email-channel-test-configuration';
import type { PreparedOutboundEmail } from './deliver-notification-email';
import { sendBroadcastEmails } from './send-broadcast-emails';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function prisma(overrides: Record<string, unknown> = {}) {
  const findMany = jest.fn(async () => [
    { id: 'requester', email: 'req@epbih.ba', displayName: 'Req', preferredLocale: 'en' },
    { id: 'agent', email: 'agent@epbih.ba', displayName: 'Agent', preferredLocale: null },
    { id: 'lead', email: 'lead@epbih.ba', displayName: 'Lead', preferredLocale: null },
  ]);
  return {
    findMany,
    client: {
      ticket: {
        findUnique: async () => ({
          id: 't1',
          ticketNumber: 'HD-9',
          title: 'Mreža',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          classification: 'INTERNAL',
          isConfidential: false,
          serviceId: 's1',
          assignedGroupId: null,
          requesterId: 'requester',
          assignedUserId: 'agent',
          ...overrides,
        }),
      },
      service: { findUnique: async () => ({ name: 'LAN' }) },
      group: { findUnique: async () => null },
      user: { findMany },
    } as never,
  };
}

describe('sendBroadcastEmails', () => {
  it('mails requester and assignee in their language, never the sender', async () => {
    const work: PreparedOutboundEmail[] = [];
    const { client, findMany } = prisma({ assignedUserId: 'lead' });
    const sent = await sendBroadcastEmails(
      client,
      createEmailChannelTestConfiguration(),
      { ticketId: 't1', body: 'Planirani prekid u 18h', actorUserId: 'lead', batchId: 'b1' },
      { handle: async (item) => void work.push(item) },
    );
    expect(sent).toBe(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(work[0]).toMatchObject({
      toAddress: 'req@epbih.ba',
      templateKey: 'ticket.broadcast',
      dedupeKey: 'ticket.broadcast:b1:t1',
    });
    expect(work[0]?.subject).toBe('[HD-9] Notice: Mreža');
    expect(work[0]?.text).toContain('Planirani prekid u 18h');
  });

  it('does nothing when delivery is off', async () => {
    const handle = jest.fn();
    await sendBroadcastEmails(
      prisma().client,
      createEmailChannelTestConfiguration({ deliveryEnabled: false }),
      { ticketId: 't1', body: 'x', actorUserId: null, batchId: null },
      { handle },
    );
    expect(handle).not.toHaveBeenCalled();
  });
});
