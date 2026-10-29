import { loadUptimePercentByService, StatusPageService } from './status-page.service';
import { defaultServiceAvailabilityEvaluationContext } from '../service-catalog/parse-service-availability-configuration';
import { statusPageLimits } from './status-page.model';

const serviceRow = (index: number) => ({
  id: `service-${index}`,
  name: `Service ${String(index).padStart(4, '0')}`,
  availability: 'OPERATIONAL',
  category: null,
});

const windowRow = (index: number) => ({
  id: `window-${index}`,
  serviceId: 'service-0',
  startsAt: new Date(Date.now() + 60_000 + index),
  endsAt: new Date(Date.now() + 120_000 + index),
  message: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  service: { name: 'Service 0' },
});

describe('status page read resource budgets', () => {
  it('caps catalog and downtime queries with explicit hasMore contracts', async () => {
    const services = Array.from({ length: statusPageLimits.activeServicesListed + 1 }, (_, index) => serviceRow(index));
    const windows = Array.from({ length: statusPageLimits.downtimeWindowsListed + 1 }, (_, index) => windowRow(index));
    const serviceFindMany = jest.fn().mockResolvedValue(services);
    const windowFindMany = jest.fn().mockResolvedValue(windows);
    const prisma = {
      service: { findMany: serviceFindMany },
      serviceIncident: { findMany: jest.fn().mockResolvedValue([]) },
      serviceDowntimeWindow: { findMany: windowFindMany },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const page = new StatusPageService(
      prisma as never,
      { load: async () => ({ enabled: true, public: false, historyDays: 90, showUptimePercent: false }) } as never,
      {} as never,
      {} as never,
      { load: async () => {
        const { now: _now, ...bundle } = defaultServiceAvailabilityEvaluationContext();
        return bundle;
      } } as never,
    );

    const result = await page.page({ userId: 'u1', isStaff: false, canManage: false });
    expect(result).toMatchObject({ servicesHasMore: true, plannedHasMore: true });
    expect(result.categories.flatMap((category) => category.services)).toHaveLength(statusPageLimits.activeServicesListed);
    expect(result.planned).toHaveLength(statusPageLimits.downtimeWindowsListed);
    expect(serviceFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: statusPageLimits.activeServicesListed + 1 }));
    expect(windowFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: statusPageLimits.downtimeWindowsListed + 1 }));
  });

  it('turns bounded SQL downtime aggregates into one-decimal uptime percentages', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ serviceId: 'service-a', downtimeMilliseconds: 10_800_000 }]);
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T04:00:00.000Z');
    await expect(loadUptimePercentByService({ $queryRaw: queryRaw } as never, ['service-a'], start, end)).resolves.toEqual(
      new Map([['service-a', 25]]),
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
