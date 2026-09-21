import {
  buildTicketListFilters,
  buildTicketStatusFilter,
} from './build-ticket-list-filters';
import { buildTicketListOrderBy } from './build-ticket-list-order-by';

describe('buildTicketStatusFilter', () => {
  it('hides the archive unless asked for it', () => {
    expect(buildTicketStatusFilter({}, false)).toEqual({ status: { not: 'ARCHIVED' } });
    expect(buildTicketStatusFilter({ includeArchived: true }, false)).toEqual({});
  });

  it('accepts one status or several', () => {
    expect(buildTicketStatusFilter({ status: 'PENDING' }, false)).toEqual({ status: 'PENDING' });
    expect(buildTicketStatusFilter({ status: ['PENDING', 'ASSIGNED'] }, false)).toEqual({
      status: { in: ['PENDING', 'ASSIGNED'] },
    });
  });

  it('never lets someone without archive access see it, even among other statuses', () => {
    expect(buildTicketStatusFilter({ status: 'ARCHIVED' }, false)).toBeNull();
    expect(buildTicketStatusFilter({ status: ['ARCHIVED'] }, false)).toBeNull();
    expect(buildTicketStatusFilter({ status: ['ARCHIVED', 'CLOSED'] }, false)).toEqual({
      status: 'CLOSED',
    });
    expect(buildTicketStatusFilter({ status: 'ARCHIVED' }, true)).toEqual({ status: 'ARCHIVED' });
  });
});

describe('buildTicketListFilters', () => {
  it('adds no clause for an empty query', () => {
    expect(buildTicketListFilters({})).toEqual([]);
  });

  it('maps every narrowing field to one AND clause', () => {
    const clauses = buildTicketListFilters({
      originUnitId: 'ou-it',
      serviceId: 'service-vpn',
      assignedUserId: 'u1',
      priority: 'HIGH',
      requesterId: 'u2',
      groupId: 'g1',
      unassigned: true,
    });
    expect(clauses).toEqual([
      { originUnitId: 'ou-it' },
      { serviceId: 'service-vpn' },
      { assignedUserId: 'u1' },
      { priority: 'HIGH' },
      { requesterId: 'u2' },
      { assignedGroupId: 'g1' },
      { assignedUserId: null },
    ]);
  });

  it('turns the date range into one createdAt clause with Date bounds', () => {
    const [clause] = buildTicketListFilters({
      createdFrom: '2026-01-01T00:00:00.000Z',
      createdTo: '2026-02-01T00:00:00.000Z',
    });
    expect(clause).toEqual({
      createdAt: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    expect(buildTicketListFilters({ createdFrom: '2026-01-01T00:00:00.000Z' })).toEqual([
      { createdAt: { gte: new Date('2026-01-01T00:00:00.000Z') } },
    ]);
  });

  it('defines overdue as a breach and at-risk as not yet breached', () => {
    expect(buildTicketListFilters({ overdue: true })).toEqual([
      { slaState: { is: { OR: [{ isResponseBreached: true }, { isResolutionBreached: true }] } } },
    ]);
    expect(buildTicketListFilters({ atRisk: true })).toEqual([
      {
        slaState: {
          is: {
            isResponseBreached: false,
            isResolutionBreached: false,
            OR: [{ isResponseAtRisk: true }, { isResolutionAtRisk: true }],
          },
        },
      },
    ]);
    expect(buildTicketListFilters({ overdue: false, atRisk: false })).toEqual([]);
  });

  it('searches number and title, and the description only when asked', () => {
    const contains = { contains: 'vpn', mode: 'insensitive' };
    expect(buildTicketListFilters({ q: '  vpn ' })).toEqual([
      { OR: [{ ticketNumber: contains }, { title: contains }] },
    ]);
    expect(buildTicketListFilters({ q: 'vpn', searchDescription: true })).toEqual([
      { OR: [{ ticketNumber: contains }, { title: contains }, { description: contains }] },
    ]);
    expect(buildTicketListFilters({ q: '   ' })).toEqual([]);
  });
});

describe('buildTicketListOrderBy', () => {
  it('defaults to newest first with a stable tie-break', () => {
    expect(buildTicketListOrderBy()).toEqual([
      { createdAt: 'desc' },
      { updatedAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('sorts by the requested field and direction', () => {
    expect(buildTicketListOrderBy('priority', 'asc')).toEqual([
      { priority: 'asc' },
      { updatedAt: 'desc' },
      { id: 'asc' },
    ]);
    expect(buildTicketListOrderBy('updatedAt', 'asc')).toEqual([
      { updatedAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('orders by the SLA resolution deadline for slaDueAt', () => {
    expect(buildTicketListOrderBy('slaDueAt', 'asc')[0]).toEqual({
      slaState: { resolutionDueAt: 'asc' },
    });
  });
});
