import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsTimeTrackingService', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agentIt = { actorUserId: ticketsTestIds.agentIt };
  const agentHr = { actorUserId: ticketsTestIds.agentHr };
  const startedAt = new Date('2026-09-11T12:00:00.000Z');
  const endedAt = new Date('2026-09-11T12:05:40.000Z');

  it('starts and stops a timer with server-side duration', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const started = await harness.timeTracking.startTimeLog(
      ticketId,
      agentIt,
      startedAt,
    );
    expect(started.userId).toBe(ticketsTestIds.agentIt);
    expect(started.endedAt).toBeNull();
    expect(started.durationSeconds).toBeNull();
    const stopped = await harness.timeTracking.stopTimeLog(
      ticketId,
      started.id,
      agentIt,
      endedAt,
    );
    expect(stopped.durationSeconds).toBe(340);
    expect(stopped.endedAt).toBe(endedAt.toISOString());
    const listed = await harness.timeTracking.listTimeLogs(ticketId, agentIt);
    expect(listed).toEqual([stopped]);
  });

  it('rejects overlapping active timers for the same user and ticket', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    await harness.timeTracking.startTimeLog(ticketId, agentIt, startedAt);
    await expect(
      harness.timeTracking.startTimeLog(ticketId, agentIt, startedAt),
    ).rejects.toMatchObject({ response: { code: 'OVERLAPPING_TIMER' } });
  });

  it('keeps completed time entries immutable and scoped', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const started = await harness.timeTracking.startTimeLog(
      ticketId,
      agentIt,
      startedAt,
    );
    await harness.timeTracking.stopTimeLog(
      ticketId,
      started.id,
      agentIt,
      endedAt,
    );
    await expect(
      harness.timeTracking.stopTimeLog(ticketId, started.id, agentIt, endedAt),
    ).rejects.toMatchObject({ response: { code: 'TIME_LOG_NOT_ACTIVE' } });
    await expect(
      harness.timeTracking.startTimeLog(ticketId, requester, startedAt),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.timeTracking.listTimeLogs(ticketId, requester),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.timeTracking.startTimeLog(ticketId, agentHr, startedAt),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});

async function createRoutedTicket(
  harness: ReturnType<typeof createTicketsServiceHarness>,
) {
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
