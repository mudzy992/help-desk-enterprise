import { aggregateBottleneckDashboard } from './aggregate-bottleneck-dashboard';
import { reportTicketSeed } from '../report-ticket-seed';

const window = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-03T23:59:59.000Z'),
};

describe('aggregateBottleneckDashboard', () => {
  it('counts standing bottleneck statuses, overdue overlap, and daily trend', () => {
    const dashboard = aggregateBottleneckDashboard({
      window,
      tickets: [
        {
          ...reportTicketSeed({
            id: 'a',
            originUnitId: 'ou-it',
            status: 'UNROUTED',
            createdAt: new Date('2026-09-01T10:00:00.000Z'),
          }),
          isOverdue: false,
        },
        {
          ...reportTicketSeed({
            id: 'b',
            originUnitId: 'ou-it',
            status: 'WAITING_FOR_USER',
            createdAt: new Date('2026-09-02T10:00:00.000Z'),
          }),
          isOverdue: true,
        },
        {
          ...reportTicketSeed({
            id: 'c',
            originUnitId: 'ou-hr',
            status: 'PENDING_APPROVAL',
            createdAt: new Date('2026-09-02T11:00:00.000Z'),
          }),
          isOverdue: false,
        },
      ],
    });
    expect(dashboard.counts).toEqual({
      pendingApproval: 1,
      waitingForUser: 1,
      unrouted: 1,
      overdue: 1,
    });
    expect(dashboard.byOrganizationalUnit.map((row) => row.key)).toEqual([
      'ou-hr',
      'ou-it',
    ]);
    // Bez mapa labela je ključ — nikad prazno (val 1, M15/B2).
    expect(dashboard.byOrganizationalUnit.map((row) => row.label)).toEqual([
      'ou-hr',
      'ou-it',
    ]);
    expect(dashboard.trend).toHaveLength(3);
    expect(dashboard.trend[1]).toMatchObject({
      date: '2026-09-02',
      createdCount: 2,
      waitingForUser: 1,
      pendingApproval: 1,
      overdue: 1,
    });
  });
  it('uz ključ nosi naziv OU i servisa (val 1, M15/B2)', () => {
    const dashboard = aggregateBottleneckDashboard({
      window,
      tickets: [
        {
          ...reportTicketSeed({
            id: 'a',
            originUnitId: 'ou-it',
            serviceId: 'svc-vpn',
            status: 'UNROUTED',
            createdAt: new Date('2026-09-01T10:00:00.000Z'),
          }),
          isOverdue: false,
        },
        {
          ...reportTicketSeed({
            id: 'b',
            originUnitId: 'ou-gone',
            serviceId: 'svc-gone',
            status: 'WAITING_FOR_USER',
            priority: 'HIGH',
            createdAt: new Date('2026-09-01T11:00:00.000Z'),
          }),
          isOverdue: false,
        },
      ],
      unitNames: new Map([['ou-it', 'IT Ops']]),
      serviceNames: new Map([['svc-vpn', 'Pristup mreži']]),
    });

    // Poznat naziv se prikazuje, nepoznat (obrisana jedinica/servis) ostaje ključ.
    expect(dashboard.byOrganizationalUnit).toEqual([
      expect.objectContaining({ key: 'ou-gone', label: 'ou-gone' }),
      expect.objectContaining({ key: 'ou-it', label: 'IT Ops' }),
    ]);
    expect(dashboard.byService.map((row) => row.label)).toEqual([
      'svc-gone',
      'Pristup mreži',
    ]);
    // Prioritet nema šifarnik, pa mu je labela vrijednost enuma (prevodi je UI).
    // Razrez sortira po ključu, pa su oba prioriteta iz testa tu: HIGH i MEDIUM.
    expect(dashboard.byPriority.map((row) => row.label)).toEqual([
      'HIGH',
      'MEDIUM',
    ]);
    expect(dashboard.byPriority.map((row) => row.key)).toEqual([
      'HIGH',
      'MEDIUM',
    ]);
  });
});
