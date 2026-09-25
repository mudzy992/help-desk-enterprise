import { createTicketsServiceHarness, ticketsTestIds } from './create-tickets-service-harness';
import { sweepTimeLogs } from './time-tracking/sweep-time-logs';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type Harness = ReturnType<typeof createTicketsServiceHarness>;

const agentIt = { actorUserId: ticketsTestIds.agentIt };
const peer = { actorUserId: ticketsTestIds.agentItPeer };
const admin = { actorUserId: ticketsTestIds.superAdmin };
const t0 = new Date('2026-09-11T08:00:00.000Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

describe('package 1.3 — time tracking guard', () => {
  it('T1: one running timer per user; switching stops the previous one', async () => {
    const harness = createTicketsServiceHarness();
    const first = await createRoutedTicket(harness);
    const second = await createTicket(harness);
    const running = await harness.timeTracking.startTimeLog(first, agentIt, t0);
    await expect(
      harness.timeTracking.startTimeLog(second, agentIt, at(5)),
    ).rejects.toMatchObject({ response: { code: 'ACTIVE_TIMER_ELSEWHERE' } });
    const switched = await harness.timeTracking.startTimeLog(second, agentIt, at(5), {
      switchFromActive: true,
    });
    expect(switched.endedAt).toBeNull();
    const firstLogs = await harness.timeTracking.listTimeLogs(first, agentIt);
    expect(firstLogs[0]).toMatchObject({ id: running.id, durationSeconds: 300 });
  });

  it('T1: the single-timer rule can be switched off', async () => {
    const harness = createTicketsServiceHarness();
    harness.timeTrackingConfig.singleActivePerUser = false;
    const first = await createRoutedTicket(harness);
    const second = await createTicket(harness);
    await harness.timeTracking.startTimeLog(first, agentIt, t0);
    await expect(harness.timeTracking.startTimeLog(second, agentIt, at(1))).resolves.toMatchObject({
      endedAt: null,
    });
  });

  it('T3: an idle stop ends at the reported moment, never in the future', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const running = await harness.timeTracking.startTimeLog(ticketId, agentIt, t0);
    await expect(
      harness.timeTracking.stopTimeLog(ticketId, running.id, agentIt, at(20), {
        reason: 'AUTO_IDLE',
        endedAt: at(30).toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'TIME_LOG_ENDED_AT_INVALID' } });
    const stopped = await harness.timeTracking.stopTimeLog(ticketId, running.id, agentIt, at(20), {
      reason: 'AUTO_IDLE',
      endedAt: at(10).toISOString(),
    });
    expect(stopped).toMatchObject({ durationSeconds: 600, stopReason: 'AUTO_IDLE' });
  });

  it('T4: a stop after the maximum session is capped and marked', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const running = await harness.timeTracking.startTimeLog(ticketId, agentIt, t0);
    const stopped = await harness.timeTracking.stopTimeLog(ticketId, running.id, agentIt, at(60 * 30));
    expect(stopped).toMatchObject({
      durationSeconds: 8 * 3600,
      stopReason: 'AUTO_MAX_DURATION',
    });
  });

  it('T3/T4: the sweep closes forgotten and abandoned timers once', async () => {
    const harness = createTicketsServiceHarness();
    const first = await createRoutedTicket(harness);
    const second = await createTicket(harness);
    harness.timeTrackingConfig.singleActivePerUser = false;
    await harness.timeTracking.startTimeLog(first, agentIt, t0);
    await harness.timeTracking.startTimeLog(second, agentIt, at(60 * 9));
    const config = { ...harness.timeTrackingConfig };
    const result = await sweepTimeLogs(harness.memory.prisma as never, config, at(60 * 10));
    expect(result.maxDurationClosed).toBe(1);
    expect(result.idleClosed).toBe(1);
    expect(result.ownerUserIds).toEqual([ticketsTestIds.agentIt]);
    const again = await sweepTimeLogs(harness.memory.prisma as never, config, at(60 * 10));
    expect(again.maxDurationClosed + again.idleClosed).toBe(0);
    const [forgotten] = await harness.timeTracking.listTimeLogs(first, agentIt);
    expect(forgotten).toMatchObject({ durationSeconds: 8 * 3600, stopReason: 'AUTO_MAX_DURATION' });
  });

  it('T6: resolving a ticket stops its timers', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    await harness.tickets.update(ticketId, { status: 'IN_PROGRESS' }, agentIt);
    await harness.timeTracking.startTimeLog(ticketId, agentIt);
    await harness.tickets.update(
      ticketId,
      { status: 'RESOLVED', closeCode: 'bug_fixed', resolutionNote: 'VPN restored' },
      agentIt,
    );
    const [log] = await harness.timeTracking.listTimeLogs(ticketId, agentIt);
    expect(log).toMatchObject({ stopReason: 'AUTO_TICKET_CLOSED' });
    expect(log?.endedAt).not.toBeNull();
    await expect(harness.timeTracking.startTimeLog(ticketId, agentIt)).rejects.toMatchObject({
      response: { code: 'TIME_TRACKING_NOT_ALLOWED_IN_STATUS' },
    });
  });

  it('T7: manual entries respect the backdate window and the overlap rule', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const now = at(60 * 24);
    const manual = await harness.timeTracking.addManual(
      ticketId,
      { startedAt: t0.toISOString(), durationMinutes: 45, note: 'Telefonska podrška' },
      agentIt,
      now,
    );
    expect(manual).toMatchObject({ source: 'MANUAL', durationSeconds: 2700 });
    await expect(
      harness.timeTracking.addManual(
        ticketId,
        { startedAt: at(30).toISOString(), durationMinutes: 10, note: 'Preklapanje' },
        agentIt,
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'TIME_LOG_OVERLAP' } });
    await expect(
      harness.timeTracking.addManual(
        ticketId,
        { startedAt: at(-60 * 24 * 10).toISOString(), durationMinutes: 10, note: 'Staro' },
        agentIt,
        now,
      ),
    ).rejects.toMatchObject({ response: { code: expect.any(String) } });
    await expect(
      harness.timeTracking.addManual(
        ticketId,
        { startedAt: t0.toISOString(), durationMinutes: 10, note: '   ' },
        agentIt,
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'TIME_LOG_NOTE_REQUIRED' } });
  });

  it('T8: owners correct inside the window, managers anytime; deletes are soft', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const running = await harness.timeTracking.startTimeLog(ticketId, agentIt, t0);
    await expect(
      harness.timeTracking.correct(ticketId, running.id, { note: 'Napomena', reason: 'Ispravka unosa' }, agentIt, at(1)),
    ).rejects.toMatchObject({ response: { code: 'TIME_LOG_IMMUTABLE' } });
    await harness.timeTracking.stopTimeLog(ticketId, running.id, agentIt, at(30));
    const corrected = await harness.timeTracking.correct(
      ticketId,
      running.id,
      { endedAt: at(20).toISOString(), reason: 'Zaboravio zaustaviti' },
      agentIt,
      at(60),
    );
    expect(corrected).toMatchObject({ durationSeconds: 1200, correctionReason: 'Zaboravio zaustaviti' });
    await expect(
      harness.timeTracking.correct(ticketId, running.id, { note: 'Napomena', reason: 'Tuđi unos' }, peer, at(60)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.timeTracking.correct(
        ticketId,
        running.id,
        { note: 'Napomena', reason: 'Prekasna ispravka' },
        agentIt,
        at(60 * 24 * 8),
      ),
    ).rejects.toMatchObject({ response: { code: expect.any(String) } });
    await harness.timeTracking.remove(ticketId, running.id, { reason: 'Duplikat' }, admin, at(60 * 24 * 8));
    expect(await harness.timeTracking.listTimeLogs(ticketId, agentIt)).toEqual([]);
    expect(
      await harness.timeTracking.listTimeLogs(ticketId, agentIt, { includeDeleted: true }),
    ).toEqual([]);
    const withDeleted = await harness.timeTracking.listTimeLogs(ticketId, admin, {
      includeDeleted: true,
    });
    expect(withDeleted[0]).toMatchObject({ deleteReason: 'Duplikat' });
  });

  it('heartbeat accepts only the owner of a running timer', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const running = await harness.timeTracking.startTimeLog(ticketId, agentIt, t0);
    await expect(
      harness.timeTracking.heartbeat(ticketId, running.id, agentIt, at(1)),
    ).resolves.toBeUndefined();
    await expect(
      harness.timeTracking.heartbeat(ticketId, running.id, peer, at(2)),
    ).rejects.toMatchObject({ response: { code: expect.any(String) } });
  });

  it('T10: active timer reports the running entry and the idle policy', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    await harness.timeTracking.startTimeLog(ticketId, agentIt, t0);
    const active = await harness.timeTracking.activeTimer(agentIt);
    expect(active.timer).toMatchObject({ ticketId });
    expect(active.policy).toMatchObject({ idleAutoPauseMinutes: 10 });
    expect((await harness.timeTracking.activeTimer(peer)).timer).toBeNull();
  });
});

async function createRoutedTicket(harness: Harness) {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  return createTicket(harness);
}

async function createTicket(harness: Harness) {
  const created = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return created.id;
}
