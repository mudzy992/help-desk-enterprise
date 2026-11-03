import { ServiceUnavailableException } from '@nestjs/common';
import { mapServiceCatalogError } from './map-service-catalog-error';
import { ServiceCatalogError } from './service-catalog.error';

describe('mapServiceCatalogError incident status failures', () => {
  it('maps an unavailable incident read to a stable HTTP 503', () => {
    const mapped = mapServiceCatalogError(
      new ServiceCatalogError('INCIDENT_STATUS_UNAVAILABLE'),
    );

    expect(mapped).toBeInstanceOf(ServiceUnavailableException);
    expect(mapped.getStatus()).toBe(503);
    expect(mapped.getResponse()).toMatchObject({
      code: 'INCIDENT_STATUS_UNAVAILABLE',
      message: 'Service incident status is temporarily unavailable',
    });
  });
});
