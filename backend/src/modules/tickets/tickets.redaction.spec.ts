import { ticketSystemEventActions } from './collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket PII and secret redaction', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('warns and audits when a secret is pasted in warn_only mode', async () => {
    const harness = createTicketsServiceHarness();
    const created = await harness.tickets.create(
      vpnCreateInput({
        description: 'Cannot connect. password: hunter2-office',
      }),
      requester,
    );
    expect(created.redactionWarnings?.some((item) => item.patternId === 'password_assignment')).toBe(
      true,
    );
    const messages = await harness.collaboration.listMessages(created.id, agent);
    expect(
      messages.some((item) =>
        item.body.startsWith(ticketSystemEventActions.redactionWarned),
      ),
    ).toBe(true);
    const secretDiff = JSON.stringify(harness.memory.changeLogs);
    expect(secretDiff).toContain('[REDACTED]');
    expect(secretDiff).not.toContain('hunter2-office');
  });

  it('soft-blocks high-risk chat content', async () => {
    const harness = createTicketsServiceHarness();
    harness.redactionConfig.mode = 'soft_block';
    const created = await harness.tickets.create(vpnCreateInput(), requester);
    await expect(
      harness.collaboration.createMessage(
        created.id,
        { type: 'USER_REPLY', body: 'api_key=super-secret-token-value' },
        requester,
      ),
    ).rejects.toMatchObject({ response: { code: 'REDACTION_BLOCKED' } });
  });
});
