import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadOpenIncidentImpacts } from './load-open-incident-impacts';

describe('loadOpenIncidentImpacts', () => {
  it('keeps the worst impact per service', async () => {
    const prisma = {
      serviceIncidentService: {
        findMany: jest.fn().mockResolvedValue([
          { serviceId: 's1', incident: { impact: 'DEGRADED' } },
          { serviceId: 's1', incident: { impact: 'DOWN' } },
          { serviceId: 's2', incident: { impact: 'MAINTENANCE' } },
        ]),
      },
    } as unknown as PrismaService;
    const result = await loadOpenIncidentImpacts(prisma, ['s1', 's2', 's3']);
    expect(result.get('s1')).toBe('DOWN');
    expect(result.get('s2')).toBe('MAINTENANCE');
    expect(result.has('s3')).toBe(false);
  });

  it('never breaks the catalog: missing delegate or failed read means no incidents', async () => {
    expect((await loadOpenIncidentImpacts({} as PrismaService, ['s1'])).size).toBe(0);
    const failing = { serviceIncidentService: { findMany: jest.fn().mockRejectedValue(new Error('db')) } } as unknown as PrismaService;
    expect((await loadOpenIncidentImpacts(failing, ['s1'])).size).toBe(0);
  });
});
