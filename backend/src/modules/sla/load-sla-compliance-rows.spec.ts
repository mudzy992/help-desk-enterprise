import { loadSlaComplianceRows } from './load-sla-compliance-rows';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const window = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.000Z'),
};

describe('loadSlaComplianceRows', () => {
  it('loads completed dimension rows and counts breached clocks only in open tickets', async () => {
    const findMany = jest.fn(async () => [
      {
        slaProfileId: 'profile-a',
        isResponseBreached: true,
        isResolutionBreached: false,
        ticket: {
          status: 'CLOSED',
          originUnitId: 'ou-child',
          originUnit: { name: 'Child unit' },
          serviceId: 'svc-1',
          service: { name: 'VPN' },
          assignedGroupId: 'group-1',
          assignedGroup: { name: 'Service desk' },
          resolvedAt: new Date('2026-09-10T10:00:00.000Z'),
          closedAt: new Date('2026-09-11T10:00:00.000Z'),
        },
      },
    ]);
    const count = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const prisma = { ticketSlaState: { findMany, count } };

    const result = await loadSlaComplianceRows(prisma as never, {
      window,
      organizationalUnitIds: ['ou-child'],
    });

    expect(result.rows).toEqual([
      {
        slaProfileId: 'profile-a',
        isResponseBreached: true,
        isResolutionBreached: false,
        completionAt: new Date('2026-09-11T10:00:00.000Z'),
        status: 'CLOSED',
        originUnitId: 'ou-child',
        originUnitName: 'Child unit',
        serviceId: 'svc-1',
        serviceName: 'VPN',
        assignedGroupId: 'group-1',
        assignedGroupName: 'Service desk',
      },
    ]);
    expect(result.openBreached).toEqual({ response: 2, resolution: 3 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ticket: {
            is: expect.objectContaining({
              originUnitId: { in: ['ou-child'] },
              status: { in: ['RESOLVED', 'CLOSED', 'ARCHIVED'] },
            }),
          },
        }),
      }),
    );
    expect(count).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          isResponseBreached: true,
          ticket: {
            is: expect.objectContaining({
              originUnitId: { in: ['ou-child'] },
              status: { in: ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] },
            }),
          },
        }),
      }),
    );
  });

  it('fails closed without querying when the authorized OU scope resolves empty', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const result = await loadSlaComplianceRows(
      { ticketSlaState: { findMany, count } } as never,
      { window, organizationalUnitIds: [] },
    );
    expect(result).toEqual({ rows: [], openBreached: { response: 0, resolution: 0 } });
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
