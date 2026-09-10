import { parseServiceAvailabilityConfigurationBundle } from './parse-service-availability-configuration';
import { ServiceCatalogError } from './service-catalog.error';

const valid = {
  availabilityEnabled: true,
  allowedStatusesCsv: 'OPERATIONAL,DEGRADED,DOWN,MAINTENANCE',
  showStatusInCatalog: true,
  showStatusInTicketCreate: true,
  changeRequiresReason: true,
  downtimeEnabled: true,
  autoSetMaintenanceStatus: true,
  autoRestoreOperational: true,
  requireReason: true,
};

describe('parseServiceAvailabilityConfigurationBundle', () => {
  it('parses the default RAW availability and downtime settings', () => {
    const parsed = parseServiceAvailabilityConfigurationBundle(valid);
    expect(parsed.availability.allowedStatuses).toEqual([
      'OPERATIONAL',
      'DEGRADED',
      'DOWN',
      'MAINTENANCE',
    ]);
    expect(parsed.downtime.autoSetMaintenanceStatus).toBe(true);
  });

  it('rejects an empty or unknown availability allow-list', () => {
    expect(() =>
      parseServiceAvailabilityConfigurationBundle({
        ...valid,
        allowedStatusesCsv: '',
      }),
    ).toThrow(new ServiceCatalogError('AVAILABILITY_UNAVAILABLE'));
    expect(() =>
      parseServiceAvailabilityConfigurationBundle({
        ...valid,
        allowedStatusesCsv: 'OPERATIONAL,ACTIVE',
      }),
    ).toThrow(new ServiceCatalogError('AVAILABILITY_UNAVAILABLE'));
  });

  it('rejects non-boolean downtime flags', () => {
    expect(() =>
      parseServiceAvailabilityConfigurationBundle({
        ...valid,
        downtimeEnabled: 'true',
      }),
    ).toThrow(new ServiceCatalogError('DOWNTIME_UNAVAILABLE'));
  });
});
