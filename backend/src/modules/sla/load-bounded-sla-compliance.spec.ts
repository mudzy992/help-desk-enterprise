import { loadBoundedSlaCompliance, maximumSlaComplianceAggregateRows } from './load-bounded-sla-compliance';
import { SlaError } from './sla.error';

const window = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-02-01T00:00:00Z') };

describe('bounded SLA compliance aggregation', () => {
  it('maps database aggregates without loading ticket rows', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'p1', key: 'gold', name: 'Gold' }]);
    const queryRaw = jest.fn().mockResolvedValue([
      { kind: 'profile', slaProfileId: 'p1', dimensionId: null, dimensionName: null, sampleCount: 4n, responseMet: 3n, resolutionMet: 2n },
      { kind: 'service', slaProfileId: 'p1', dimensionId: 's1', dimensionName: 'VPN', sampleCount: 4n, responseMet: 3n, resolutionMet: 2n },
    ]);
    const count = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const result = await loadBoundedSlaCompliance({ slaProfile: { findMany }, ticketSlaState: { count }, $queryRaw: queryRaw } as never, { window, organizationalUnitIds: ['ou1'] });
    expect(result.profiles[0]).toMatchObject({ sampleCount: 4, responseCompliancePercent: 75, resolutionCompliancePercent: 50 });
    expect(result.byService).toHaveLength(1);
    expect(result.openBreached).toEqual({ response: 2, resolution: 1 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['p1'] } },
      take: 1000,
    }));
  });

  it('fails closed when aggregate cardinality exceeds the output budget', async () => {
    const row = { kind: 'unit', slaProfileId: 'p1', dimensionId: 'u', dimensionName: 'U', sampleCount: 1n, responseMet: 1n, resolutionMet: 1n };
    const prisma = { slaProfile: { findMany: jest.fn().mockResolvedValue([]) }, $queryRaw: jest.fn().mockResolvedValue(new Array(maximumSlaComplianceAggregateRows + 1).fill(row)) };
    await expect(loadBoundedSlaCompliance(prisma as never, { window, organizationalUnitIds: ['ou1'] })).rejects.toEqual(new SlaError('COMPLIANCE_RESOURCE_LIMIT_EXCEEDED'));
  });
});
