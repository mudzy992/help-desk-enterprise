import { createEmailChannelTestConfiguration } from './email-channel-test-configuration';
import { fanOutEmailNotifications } from './fan-out-email-notifications';
import type { PreparedOutboundEmail } from './deliver-notification-email';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import type { MailTransport, OutboundMailMessage } from './mail-transport';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../../tickets/create-tickets-service-harness';
import { toTicketRealtimePayload } from '../../tickets/to-collaboration-response';
import { vpnCreateInput } from '../../tickets/vpn-create-input';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('email notification fan-out', () => {
  it('sends one internal email per event and skips duplicates', async () => {
    const harness = await routedWithInternalAgent();
    const mail = createRecordingTransport();
    const created = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestEmail(harness, mail, enabledConfiguration());
    await ingestEmail(harness, mail, enabledConfiguration());
    expect(mail.messages).toHaveLength(1);
    expect(mail.messages[0]).toMatchObject({
      to: 'user-agent-it@epbih.ba',
      from: 'helpdesk@epbih.ba',
    });
    expect(mail.messages[0]?.subject).toContain(created.ticketNumber);
    expect([...harness.memory.emailDeliveries.values()]).toHaveLength(1);
  });

  it('does not send when the channel, SMTP, or addon is off', async () => {
    const harness = await routedWithInternalAgent();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const mail = createRecordingTransport();
    await ingestEmail(harness, mail, enabledConfiguration({ deliveryEnabled: false }));
    expect(mail.messages).toEqual([]);
  });

  it('does not send to external addresses while internal-only is on', async () => {
    const harness = await routedWithInternalAgent();
    harness.memory.seedUser({
      id: ticketsTestIds.agentIt,
      organizationalUnitId: ticketsTestIds.ouIt,
      email: 'agent@gmail.com',
    });
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const mail = createRecordingTransport();
    await ingestEmail(harness, mail, enabledConfiguration());
    expect(mail.messages).toEqual([]);
    expect([...harness.memory.emailDeliveries.values()]).toEqual([]);
  });

  it('releases the claim when SMTP send fails so a retry can send', async () => {
    const harness = await routedWithInternalAgent();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const failing: MailTransport = {
      send: async () => {
        throw new Error('SMTP unavailable');
      },
    };
    await expect(
      ingestEmail(harness, failing, enabledConfiguration()),
    ).rejects.toThrow(/SMTP unavailable/);
    expect([...harness.memory.emailDeliveries.values()]).toEqual([]);
    const mail = createRecordingTransport();
    await ingestEmail(harness, mail, enabledConfiguration());
    expect(mail.messages).toHaveLength(1);
  });

  it('can enqueue outbound mail instead of sending SMTP immediately', async () => {
    const harness = await routedWithInternalAgent();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const mail = createRecordingTransport();
    const enqueued: PreparedOutboundEmail[] = [];
    for (const message of harness.memory.messages.values()) {
      const ticket = harness.memory.tickets.get(message.ticketId);
      if (ticket === undefined) {
        continue;
      }
      await fanOutEmailNotifications(
        harness.memory.prisma as never,
        enabledConfiguration(),
        mail,
        toTicketRealtimePayload(message, ticket),
        {
          handle: async (work) => {
            enqueued.push(work);
          },
        },
      );
    }
    expect(mail.messages).toEqual([]);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.toAddress).toBe('user-agent-it@epbih.ba');
  });

  it('uses the ticket number instead of the title for confidential tickets', async () => {
    const harness = await routedWithInternalAgent();
    const created = await harness.tickets.create(
      vpnCreateInput({ isConfidential: true, title: 'Secret outage' }),
      { actorUserId: ticketsTestIds.requester },
    );
    const mail = createRecordingTransport();
    await ingestEmail(harness, mail, enabledConfiguration());
    expect(mail.messages[0]?.text).toContain(created.ticketNumber);
    expect(mail.messages[0]?.text).not.toContain('Secret outage');
  });

  it('sends HTML with threading headers and a link to the ticket (paket 1.5)', async () => {
    const harness = await routedWithInternalAgent();
    const created = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const mail = createRecordingTransport();
    await ingestEmail(harness, mail, enabledConfiguration());
    const message = mail.messages[0];
    expect(message?.html).toContain('<!DOCTYPE html>');
    expect(message?.html).toContain(`https://desk.epbih.ba/tickets/${created.id}`);
    expect(message?.subject.startsWith(`[${created.ticketNumber}]`)).toBe(true);
    expect(message?.headers).toMatchObject({
      References: `<ticket-${created.id}@epbih.ba>`,
      'Auto-Submitted': 'auto-generated',
    });
    expect(message?.messageId).toMatch(/@epbih\.ba>$/);
    expect(message?.replyTo).toBeUndefined();
  });

  it("renders in the recipient's preferred language", async () => {
    const harness = await routedWithInternalAgent();
    harness.memory.seedUser({
      id: ticketsTestIds.agentIt,
      organizationalUnitId: ticketsTestIds.ouIt,
      email: 'user-agent-it@epbih.ba',
      preferredLocale: 'en',
    });
    await harness.tickets.create(vpnCreateInput(), { actorUserId: ticketsTestIds.requester });
    const mail = createRecordingTransport();
    await ingestEmail(harness, mail, enabledConfiguration());
    expect(mail.messages[0]?.subject).toContain('New ticket');
    expect(mail.messages[0]?.html).toContain('lang="en"');
  });

  it('loads all recipients with one query instead of one per recipient', async () => {
    const harness = await routedWithInternalAgent();
    await harness.tickets.create(vpnCreateInput(), { actorUserId: ticketsTestIds.requester });
    const prisma = harness.memory.prisma as unknown as {
      user: { findUnique: (...args: unknown[]) => unknown; findMany: (...args: unknown[]) => unknown };
    };
    const findUnique = jest.spyOn(prisma.user, 'findUnique');
    const findMany = jest.spyOn(prisma.user, 'findMany');
    await ingestEmail(harness, createRecordingTransport(), enabledConfiguration());
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

function enabledConfiguration(
  overrides: Partial<EmailChannelConfiguration> = {},
): EmailChannelConfiguration {
  return createEmailChannelTestConfiguration(overrides);
}

function createRecordingTransport(): MailTransport & {
  readonly messages: OutboundMailMessage[];
} {
  const messages: OutboundMailMessage[] = [];
  return {
    messages,
    send: async (message) => {
      messages.push(message);
    },
  };
}

async function routedWithInternalAgent() {
  const harness = createTicketsServiceHarness();
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  harness.memory.seedGroupMember({
    groupId: ticketsTestIds.groupIt,
    userId: ticketsTestIds.agentIt,
  });
  harness.memory.seedUser({
    id: ticketsTestIds.agentIt,
    organizationalUnitId: ticketsTestIds.ouIt,
    email: 'user-agent-it@epbih.ba',
  });
  return harness;
}

async function ingestEmail(
  harness: ReturnType<typeof createTicketsServiceHarness>,
  mailTransport: MailTransport,
  configuration: EmailChannelConfiguration,
): Promise<void> {
  for (const message of harness.memory.messages.values()) {
    const ticket = harness.memory.tickets.get(message.ticketId);
    if (ticket === undefined) {
      continue;
    }
    await fanOutEmailNotifications(
      harness.memory.prisma as never,
      configuration,
      mailTransport,
      toTicketRealtimePayload(message, ticket),
    );
  }
}
