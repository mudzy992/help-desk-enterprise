import { serviceReadWhere } from './service-read-where';

describe('serviceReadWhere', () => {
  it('limits an agent to the public lifecycles, so drafts stay hidden', () => {
    expect(serviceReadWhere({ visibleLifecycles: ['ACTIVE', 'DEPRECATED'] })).toEqual({
      lifecycle: { in: ['ACTIVE', 'DEPRECATED'] },
    });
  });

  it('lets a global admin read every lifecycle', () => {
    expect(serviceReadWhere({ visibleLifecycles: ['DRAFT', 'ACTIVE', 'DEPRECATED'] })).toEqual({
      lifecycle: { in: ['DRAFT', 'ACTIVE', 'DEPRECATED'] },
    });
  });

  it('gives a service-scoped admin drafts only for its own services', () => {
    expect(
      serviceReadWhere({ visibleLifecycles: ['ACTIVE', 'DEPRECATED'], scopedServiceIds: ['svc-b', 'svc-a'] }),
    ).toEqual({
      AND: [
        {
          OR: [
            { lifecycle: { in: ['ACTIVE', 'DEPRECATED'] } },
            { lifecycle: { in: ['DRAFT'] }, id: { in: ['svc-a', 'svc-b'] } },
          ],
        },
      ],
    });
  });

  it('fails closed when the principal may see no lifecycle at all', () => {
    expect(serviceReadWhere({ visibleLifecycles: [] })).toEqual({ id: { in: [] } });
    expect(serviceReadWhere({ visibleLifecycles: [], scopedServiceIds: [] })).toEqual({ id: { in: [] } });
  });
});
