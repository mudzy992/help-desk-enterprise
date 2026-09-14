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
    expect(dashboard.trend).toHaveLength(3);
    expect(dashboard.trend[1]).toMatchObject({
      date: '2026-09-02',
      createdCount: 2,
      waitingForUser: 1,
      pendingApproval: 1,
      overdue: 1,
    });
  });
});
