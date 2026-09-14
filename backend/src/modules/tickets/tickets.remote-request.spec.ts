import { ticketSystemEventActions } from './collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { settingKeys } from '../settings/setting-keys';
import { TicketsRemoteService } from './remote/tickets-remote.service';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsRemoteService', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agentIt = { actorUserId: ticketsTestIds.agentIt };

  it('lets staff request remote once and rate-limits the next request', async () => {
    const harness = createTicketsServiceHarness();
    const remote = createRemoteService(harness, true, 10);
    const ticketId = await createRoutedTicket(harness);
    const first = await remote.requestRemote(ticketId, agentIt);
    expect(first.ticketId).toBe(ticketId);
    expect(first.rateLimitMinutes).toBe(10);
    const stored = [...harness.memory.messages.values()].filter(
      (message) => message.body === ticketSystemEventActions.remoteRequested,
    );
    expect(stored).toHaveLength(1);
    const [message] = stored;
    if (message !== undefined) {
      harness.memory.messages.set(message.id, {
        ...message,
        createdAt: new Date(),
      });
    }
    await expect(remote.requestRemote(ticketId, agentIt)).rejects.toMatchObject({
      response: { code: 'REMOTE_RATE_LIMITED' },
    });
    if (message !== undefined) {
      harness.memory.messages.set(message.id, {
        ...message,
        createdAt: new Date(Date.now() - 11 * 60 * 1000),
      });
    }
    const third = await remote.requestRemote(ticketId, agentIt);
    expect(third.ticketId).toBe(ticketId);
    expect(
      [...harness.memory.messages.values()].filter(
        (item) => item.body === ticketSystemEventActions.remoteRequested,
      ),
    ).toHaveLength(2);
  });

  it('rejects requester initiation and disabled remote', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const enabled = createRemoteService(harness, true, 10);
    await expect(enabled.requestRemote(ticketId, requester)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    const disabled = createRemoteService(harness, false, 10);
    await expect(disabled.requestRemote(ticketId, agentIt)).rejects.toMatchObject({
      response: { code: 'REMOTE_DISABLED' },
    });
  });
});

function createRemoteService(
  harness: ReturnType<typeof createTicketsServiceHarness>,
  enabled: boolean,
  rateLimitMinutes: number,
): TicketsRemoteService {
  return new TicketsRemoteService(
    harness.memory.prisma as never,
    harness.authorizationContextLoader as never,
    harness.accessPolicies,
    harness.realtimeHub,
    {
      getSetting: (key: string) => {
        if (key === settingKeys.privateEdgeExtensionRemoteEnabled) {
          return Promise.resolve(enabled);
        }
        if (
          key === settingKeys.privateEdgeExtensionRemoteRateLimitMinutesPerTicket
        ) {
          return Promise.resolve(rateLimitMinutes);
        }
        if (key === settingKeys.privateAddonsEdge) {
          return Promise.resolve(true);
        }
        if (key === settingKeys.privateEdgeExtensionKillSwitchEnabled) {
          return Promise.resolve(false);
        }
        if (key === settingKeys.privateEdgeExtensionAttachmentsEnabled) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      },
    } as never,
  );
}

async function createRoutedTicket(
  harness: ReturnType<typeof createTicketsServiceHarness>,
): Promise<string> {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const created = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return created.id;
}
