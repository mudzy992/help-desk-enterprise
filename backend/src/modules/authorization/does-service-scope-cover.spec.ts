import { doesServiceScopeCover } from './does-service-scope-cover';

describe('doesServiceScopeCover', () => {
  it('treats a null assignment as all services', () => {
    expect(
      doesServiceScopeCover({
        assignedServiceId: null,
        requestedServiceId: 'service-hr',
      }),
    ).toBe(true);
  });

  it('matches only the assigned service id', () => {
    expect(
      doesServiceScopeCover({
        assignedServiceId: 'service-hr',
        requestedServiceId: 'service-hr',
      }),
    ).toBe(true);
    expect(
      doesServiceScopeCover({
        assignedServiceId: 'service-hr',
        requestedServiceId: 'service-it',
      }),
    ).toBe(false);
  });

  it('fails closed for missing or blank requested or assigned values', () => {
    expect(
      doesServiceScopeCover({
        assignedServiceId: 'service-hr',
        requestedServiceId: null,
      }),
    ).toBe(false);
    expect(
      doesServiceScopeCover({
        assignedServiceId: '   ',
        requestedServiceId: 'service-hr',
      }),
    ).toBe(false);
  });
});
