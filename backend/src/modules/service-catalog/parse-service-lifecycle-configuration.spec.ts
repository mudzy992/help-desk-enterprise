import { parseServiceLifecycleConfiguration } from './parse-service-lifecycle-configuration';
import { ServiceCatalogError } from './service-catalog.error';

describe('parseServiceLifecycleConfiguration', () => {
  it('parses the default RAW settings', () => {
    expect(
      parseServiceLifecycleConfiguration({
        enabled: true,
        allowedStatesCsv: 'DRAFT,ACTIVE,DEPRECATED',
        defaultStateOnCreate: 'DRAFT',
      }),
    ).toEqual({
      enabled: true,
      allowedStates: ['DRAFT', 'ACTIVE', 'DEPRECATED'],
      defaultStateOnCreate: 'DRAFT',
    });
  });

  it('rejects an empty or unknown allow-list', () => {
    expect(() =>
      parseServiceLifecycleConfiguration({
        enabled: true,
        allowedStatesCsv: '',
        defaultStateOnCreate: 'DRAFT',
      }),
    ).toThrow(new ServiceCatalogError('LIFECYCLE_UNAVAILABLE'));
    expect(() =>
      parseServiceLifecycleConfiguration({
        enabled: true,
        allowedStatesCsv: 'DRAFT,MAINTENANCE',
        defaultStateOnCreate: 'DRAFT',
      }),
    ).toThrow(new ServiceCatalogError('LIFECYCLE_UNAVAILABLE'));
  });

  it('requires the create default to be in the allow-list', () => {
    expect(() =>
      parseServiceLifecycleConfiguration({
        enabled: true,
        allowedStatesCsv: 'DRAFT,ACTIVE',
        defaultStateOnCreate: 'DEPRECATED',
      }),
    ).toThrow(new ServiceCatalogError('LIFECYCLE_UNAVAILABLE'));
  });
});
