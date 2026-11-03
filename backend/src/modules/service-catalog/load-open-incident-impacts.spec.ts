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

  it('does not query incident impacts when there are no services', async () => {
    const findMany = jest.fn();
    const prisma = {
      serviceIncidentService: { findMany },
    } as unknown as PrismaService;

    await expect(loadOpenIncidentImpacts(prisma, [])).resolves.toEqual(new Map());
    expect(findMany).not.toHaveBeenCalled();
  });

  it('fails closed when the incident delegate is unavailable', async () => {
    await expect(loadOpenIncidentImpacts({} as PrismaService, ['s1'])).rejects.toMatchObject({
      name: 'ServiceCatalogError',
      code: 'INCIDENT_STATUS_UNAVAILABLE',
    });
  });

  it('fails closed when the database read fails instead of reporting no incidents', async () => {
    const failing = {
      serviceIncidentService: {
        findMany: jest.fn().mockRejectedValue(new Error('db')),
      },
    } as unknown as PrismaService;

    await expect(loadOpenIncidentImpacts(failing, ['s1'])).rejects.toMatchObject({
      name: 'ServiceCatalogError',
      code: 'INCIDENT_STATUS_UNAVAILABLE',
    });
  });
});
