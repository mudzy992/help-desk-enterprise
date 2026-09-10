import {
  assertServiceLifecycleTransition,
  isServiceOfferedToRequesters,
} from './assert-service-lifecycle-transition';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogError } from './service-catalog.error';

describe('service lifecycle transitions', () => {
  const configuration = defaultServiceLifecycleConfiguration;

  it('allows draft to active, active to deprecated, and deprecated to active', () => {
    expect(() =>
      assertServiceLifecycleTransition({
        from: 'DRAFT',
        to: 'ACTIVE',
        configuration,
      }),
    ).not.toThrow();
    expect(() =>
      assertServiceLifecycleTransition({
        from: 'ACTIVE',
        to: 'DEPRECATED',
        configuration,
      }),
    ).not.toThrow();
    expect(() =>
      assertServiceLifecycleTransition({
        from: 'DEPRECATED',
        to: 'ACTIVE',
        configuration,
      }),
    ).not.toThrow();
  });

  it.each([
    ['DRAFT', 'DEPRECATED'],
    ['DRAFT', 'DRAFT'],
    ['ACTIVE', 'DRAFT'],
    ['DEPRECATED', 'DRAFT'],
    ['DEPRECATED', 'DEPRECATED'],
    ['ACTIVE', 'ACTIVE'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(() =>
      assertServiceLifecycleTransition({ from, to, configuration }),
    ).toThrow(ServiceCatalogError);
    try {
      assertServiceLifecycleTransition({ from, to, configuration });
    } catch (error) {
      expect((error as ServiceCatalogError).code).toBe(
        'INVALID_LIFECYCLE_TRANSITION',
      );
    }
  });

  it('rejects a target outside the allow-list', () => {
    expect(() =>
      assertServiceLifecycleTransition({
        from: 'DRAFT',
        to: 'ACTIVE',
        configuration: {
          enabled: true,
          allowedStates: ['DRAFT', 'DEPRECATED'],
          defaultStateOnCreate: 'DRAFT',
        },
      }),
    ).toThrow(new ServiceCatalogError('INVALID_LIFECYCLE_STATE'));
  });

  it('rejects transitions when lifecycle is disabled', () => {
    expect(() =>
      assertServiceLifecycleTransition({
        from: 'DRAFT',
        to: 'ACTIVE',
        configuration: { ...configuration, enabled: false },
      }),
    ).toThrow(new ServiceCatalogError('LIFECYCLE_DISABLED'));
  });

  it('offers only ACTIVE services to requesters', () => {
    expect(isServiceOfferedToRequesters('ACTIVE')).toBe(true);
    expect(isServiceOfferedToRequesters('DRAFT')).toBe(false);
    expect(isServiceOfferedToRequesters('DEPRECATED')).toBe(false);
  });
});
