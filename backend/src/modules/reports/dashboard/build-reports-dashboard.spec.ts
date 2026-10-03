import { reportTicketSeed } from '../report-ticket-seed';
import { ticketsTestIds } from '../../tickets/tickets-test-ids';
import { createReportsServiceHarness } from '../create-reports-service-harness';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ReportsService.dashboard', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('returns KPI parity for scoped tickets in the report window', async () => {
    const harness = createReportsServiceHarness();
    harness.memory.tickets.set(
      't-resolved',
      reportTicketSeed({
        id: 't-resolved',
        originUnitId: ticketsTestIds.ouIt,
        status: 'RESOLVED',
        createdAt: new Date('2026-09-10T08:00:00.000Z'),
        resolvedAt: new Date('2026-09-10T14:00:00.000Z'),
        firstResponseAt: new Date('2026-09-10T08:30:00.000Z'),
        assignedGroupId: ticketsTestIds.groupIt,
      }),
    );
    harness.memory.tickets.set(
      't-open',
      reportTicketSeed({
        id: 't-open',
        originUnitId: ticketsTestIds.ouIt,
        status: 'IN_PROGRESS',
        createdAt: new Date('2026-09-12T08:00:00.000Z'),
        firstResponseAt: new Date('2026-09-12T08:30:00.000Z'),
      }),
    );
    harness.memory.tickets.set(
      't-sibling',
      reportTicketSeed({
        id: 't-sibling',
        originUnitId: ticketsTestIds.ouHr,
        status: 'PENDING',
        createdAt: new Date('2026-09-12T08:00:00.000Z'),
      }),
    );
    const dashboard = await harness.reports.dashboard(
      {
        organizationalUnitId: ticketsTestIds.ouIt,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-15T23:59:59.999Z',
      },
      now,
    );
    expect(dashboard.ticketCount).toBe(2);
    expect(dashboard.kpis.createdCount).toBe(2);
    expect(dashboard.kpis.firstResponseMinutes).toBe(30);
    expect(dashboard.kpis.resolutionHours).toBe(6);
    expect(dashboard.kpis.resolutionSampleCount).toBe(1);
    expect(dashboard.bottlenecksEnabled).toBe(true);
    expect(dashboard.bottleneckByGroup[0]?.value).toBe(6);
    expect(dashboard.serviceVolume[0]?.value).toBe(2);
    // Val 1 (M15 gap): razrez po OU i opterećenje izvršioca.
    expect(dashboard.originUnitVolume).toEqual([
      { key: ticketsTestIds.ouIt, label: ticketsTestIds.ouIt, value: 2 },
    ]);
    expect(dashboard.assigneeWorkload).toEqual([]);
    expect(dashboard.aging.lessThanOneDay + dashboard.aging.oneToThreeDays).toBe(
      1,
    );
  });

  it('razrezuje tikete po OU i otvorene tikete po izvršiocu (val 1, M15 gap)', async () => {
    const harness = createReportsServiceHarness();
    harness.memory.seedUnit({
      id: ticketsTestIds.ouIt,
      parentId: ticketsTestIds.ouRoot,
      ouPath: '/Korisnici/IT',
      name: 'IT',
    });
    harness.memory.seedUser({
      id: ticketsTestIds.agentIt,
      organizationalUnitId: ticketsTestIds.ouIt,
      displayName: 'Amina Agent',
    });
    harness.memory.seedUser({
      id: ticketsTestIds.agentItPeer,
      organizationalUnitId: ticketsTestIds.ouIt,
      displayName: 'Benjamin Agent',
    });
    // Otvoreni tiketi: dva na Amini, jedan neusmjeren, jedan riješen.
    harness.memory.tickets.set(
      't-mine-1',
      reportTicketSeed({
        id: 't-mine-1',
        originUnitId: ticketsTestIds.ouIt,
        status: 'IN_PROGRESS',
        assignedUserId: ticketsTestIds.agentIt,
        createdAt: new Date('2026-09-10T08:00:00.000Z'),
      }),
    );
    harness.memory.tickets.set(
      't-mine-2',
      reportTicketSeed({
        id: 't-mine-2',
        originUnitId: ticketsTestIds.ouIt,
        status: 'PENDING',
        assignedUserId: ticketsTestIds.agentIt,
        createdAt: new Date('2026-09-11T08:00:00.000Z'),
      }),
    );
    harness.memory.tickets.set(
      't-peer',
      reportTicketSeed({
        id: 't-peer',
        originUnitId: ticketsTestIds.ouHr,
        status: 'WAITING_FOR_USER',
        assignedUserId: ticketsTestIds.agentItPeer,
        createdAt: new Date('2026-09-12T08:00:00.000Z'),
      }),
    );
    harness.memory.tickets.set(
      't-orphan',
      reportTicketSeed({
        id: 't-orphan',
        originUnitId: ticketsTestIds.ouIt,
        status: 'UNROUTED',
        createdAt: new Date('2026-09-12T09:00:00.000Z'),
      }),
    );
    harness.memory.tickets.set(
      't-done',
      reportTicketSeed({
        id: 't-done',
        originUnitId: ticketsTestIds.ouIt,
        status: 'RESOLVED',
        assignedUserId: ticketsTestIds.agentIt,
        createdAt: new Date('2026-09-09T08:00:00.000Z'),
        resolvedAt: new Date('2026-09-09T12:00:00.000Z'),
      }),
    );
    const dashboard = await harness.reports.dashboard(
      {
        organizationalUnitId: ticketsTestIds.ouRoot,
        from: '2026-09-09T00:00:00.000Z',
        to: '2026-09-15T23:59:59.999Z',
      },
      now,
    );
    // OU razrez broji samo kreirane u prozoru; jedinica bez naziva nosi ključ.
    expect(dashboard.originUnitVolume).toEqual([
      { key: ticketsTestIds.ouIt, label: 'IT', value: 4 },
      { key: ticketsTestIds.ouHr, label: ticketsTestIds.ouHr, value: 1 },
    ]);
    // Opterećenje: otvoreni tiketi s izvršiocem, riješeni i neusmjereni ne ulaze.
    expect(dashboard.assigneeWorkload).toEqual([
      { key: ticketsTestIds.agentIt, label: 'Amina Agent', value: 2 },
      { key: ticketsTestIds.agentItPeer, label: 'Benjamin Agent', value: 1 },
    ]);
  });

  it('isključena postavka uskih grla prazni razrez i nosi zastavicu (val 1, M15/B1)', async () => {
    const harness = createReportsServiceHarness({ bottlenecksEnabled: false });
    harness.memory.tickets.set(
      't-resolved',
      reportTicketSeed({
        id: 't-resolved',
        originUnitId: ticketsTestIds.ouIt,
        status: 'RESOLVED',
        createdAt: new Date('2026-09-10T08:00:00.000Z'),
        resolvedAt: new Date('2026-09-10T14:00:00.000Z'),
        assignedGroupId: ticketsTestIds.groupIt,
      }),
    );
    const dashboard = await harness.reports.dashboard(
      {
        organizationalUnitId: ticketsTestIds.ouIt,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-15T23:59:59.999Z',
      },
      now,
    );

    expect(dashboard.bottlenecksEnabled).toBe(false);
    expect(dashboard.bottleneckByGroup).toEqual([]);
    // Ostali dijelovi pregleda se ne mijenjaju.
    expect(dashboard.ticketCount).toBe(1);
    expect(dashboard.serviceVolume[0]?.value).toBe(1);

    // I sam API uskih grla vraća svoju grešku kad je postavka isključena.
    await expect(
      harness.reports.bottleneck(
        {
          organizationalUnitId: ticketsTestIds.ouIt,
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-15T23:59:59.999Z',
        },
        now,
      ),
    ).rejects.toMatchObject({ code: 'BOTTLENECKS_DISABLED' });
  });
});
