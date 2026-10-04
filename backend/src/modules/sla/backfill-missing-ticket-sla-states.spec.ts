import { backfillMissingTicketSlaStates } from './backfill-missing-ticket-sla-states';
import { loadTicketSlaState } from './persist-ticket-sla-state';
import { standardWeeklyHours } from './sla.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { vpnCreateInput } from '../tickets/vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Val 2 (M10/B2): a ticket created while its service had no active SLA
 * profile/rule/calendar never got `TicketSlaState`, and the scanner only read
 * existing states — so it stayed invisible to SLA monitoring until somebody
 * touched it again. The scan cycle now adopts a bounded batch of such tickets.
 */
describe('backfillMissingTicketSlaStates (val 2, M10/B2)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-11T12:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** A ticket created before the service had any SLA profile — no state. */
  async function createTicketWithoutClock() {
    const harness = createTicketsServiceHarness();
    harness.slaConfig.enabled = true;
    const ticket = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(
      await loadTicketSlaState(harness.memory.prisma as never, ticket.id),
    ).toBeNull();
    return { harness, ticket };
  }

  async function attachProfile(harness: ReturnType<typeof createTicketsServiceHarness>) {
    const calendar = await harness.memory.prisma.businessHoursCalendar.create({
      data: {
        key: 'BH_STANDARD',
        name: 'BH Standard',
        timezone: 'Europe/Sarajevo',
        weeklyHours: standardWeeklyHours,
        isActive: true,
      },
    });
    const profile = await harness.memory.prisma.slaProfile.create({
      data: {
        key: 'STANDARD_REQUEST',
        name: 'Standard request',
        description: null,
        calendarId: calendar.id,
        isActive: true,
      },
    });
    await harness.memory.prisma.slaRule.create({
      data: {
        slaProfileId: profile.id,
        priority: 'HIGH',
        responseMinutes: 60,
        resolutionMinutes: 240,
        evaluationOrder: 100,
        organizationalUnitId: null,
        serviceId: null,
      },
    });
    harness.memory.bindServiceSlaProfile(ticketsTestIds.serviceVpn, profile.id);
  }

  it('uspostavlja sat tiketa koji ga je propustio, od createdAt', async () => {
    const { harness, ticket } = await createTicketWithoutClock();
    await attachProfile(harness);

    const started = await backfillMissingTicketSlaStates(
      harness.memory.prisma as never,
      { configuration: { ...harness.slaConfig }, now: new Date() },
    );

    expect(started).toHaveLength(1);
    const state = await loadTicketSlaState(
      harness.memory.prisma as never,
      ticket.id,
    );
    expect(state).not.toBeNull();
    // Sat počinje od kreiranja tiketa, ne od trenutka backfilla.
    const stored = harness.memory.tickets.get(ticket.id)!;
    expect(state?.startedAt.getTime()).toBe(stored.createdAt.getTime());
  });

  it('zaustavlja se na veličini batcha i nastavlja u sljedećem ciklusu', async () => {
    const first = await createTicketWithoutClock();
    // I drugi tiket nastaje prije nego servis dobije profil — oba su bez sata.
    const second = await first.harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await attachProfile(first.harness);

    const cycleOne = await backfillMissingTicketSlaStates(
      first.harness.memory.prisma as never,
      { configuration: { ...first.harness.slaConfig }, now: new Date(), batchSize: 1 },
    );
    expect(cycleOne).toHaveLength(1);

    const cycleTwo = await backfillMissingTicketSlaStates(
      first.harness.memory.prisma as never,
      { configuration: { ...first.harness.slaConfig }, now: new Date(), batchSize: 1 },
    );
    expect(cycleTwo).toHaveLength(1);
    expect(cycleTwo[0]?.ticketId).toBe(second.id);
    // Treći ciklus nema šta da uspostavi.
    await expect(
      backfillMissingTicketSlaStates(first.harness.memory.prisma as never, {
        configuration: { ...first.harness.slaConfig },
        now: new Date(),
        batchSize: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('ne dira zatvorene tikete i ne radi kad je SLA isključen', async () => {
    const { harness, ticket } = await createTicketWithoutClock();
    await attachProfile(harness);
    harness.memory.tickets.set(ticket.id, {
      ...harness.memory.tickets.get(ticket.id)!,
      status: 'CLOSED',
    });

    await expect(
      backfillMissingTicketSlaStates(harness.memory.prisma as never, {
        configuration: { ...harness.slaConfig },
        now: new Date(),
      }),
    ).resolves.toEqual([]);
    await expect(
      backfillMissingTicketSlaStates(harness.memory.prisma as never, {
        configuration: { ...harness.slaConfig, enabled: false },
        now: new Date(),
      }),
    ).resolves.toEqual([]);
  });
});
