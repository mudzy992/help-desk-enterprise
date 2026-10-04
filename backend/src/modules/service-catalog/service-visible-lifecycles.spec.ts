import {
  allServiceLifecycles,
  isServiceLifecycleVisible,
  requestedServiceLifecycles,
  visibleServiceLifecycles,
} from './service-visible-lifecycles';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Val 2 (M6/B2): `GET /services` was reachable by every signed-in role and had
 * no lifecycle filter, so drafts (and the complete form schemas of unpublished
 * services) could be read straight from the API — RAW `:304` says `DRAFT` is
 * admin-only. These tests pin the mapping role → visible states down.
 */
describe('service lifecycle visibility', () => {
  it('daje pun skup adminima, bez nacrta agentima i samo objavljeno korisnicima', () => {
    expect(visibleServiceLifecycles(['ADMIN'])).toEqual(allServiceLifecycles);
    expect(visibleServiceLifecycles(['SUPER_ADMIN'])).toEqual(allServiceLifecycles);
    expect(visibleServiceLifecycles(['AGENT'])).toEqual(['ACTIVE', 'DEPRECATED']);
    expect(visibleServiceLifecycles(['USER'])).toEqual(['ACTIVE']);
    expect(visibleServiceLifecycles([])).toEqual(['ACTIVE']);
    // Interni poziv (worker, kreiranje tiketa, testovi) ostaje bez filtera.
    expect(visibleServiceLifecycles(undefined)).toEqual(allServiceLifecycles);
  });

  it('prepoznaje skriveno stanje po roli', () => {
    expect(isServiceLifecycleVisible('DRAFT', ['USER'])).toBe(false);
    expect(isServiceLifecycleVisible('DRAFT', ['AGENT'])).toBe(false);
    expect(isServiceLifecycleVisible('DRAFT', ['ADMIN'])).toBe(true);
    expect(isServiceLifecycleVisible('DEPRECATED', ['USER'])).toBe(false);
    expect(isServiceLifecycleVisible('DEPRECATED', ['AGENT'])).toBe(true);
    expect(isServiceLifecycleVisible('ACTIVE', ['USER'])).toBe(true);
    // Bez role nema provjere.
    expect(isServiceLifecycleVisible('DRAFT', undefined)).toBe(true);
  });

  it('sužava skup upita eksplicitnim filterom, a skriveno stanje daje prazno', () => {
    expect(requestedServiceLifecycles({})).toEqual(allServiceLifecycles);
    expect(requestedServiceLifecycles({ lifecycle: 'DEPRECATED' })).toEqual([
      'DEPRECATED',
    ]);
    expect(
      requestedServiceLifecycles({
        lifecycle: 'DEPRECATED',
        visibleLifecycles: ['ACTIVE', 'DEPRECATED'],
      }),
    ).toEqual(['DEPRECATED']);
    expect(
      requestedServiceLifecycles({
        lifecycle: 'DRAFT',
        visibleLifecycles: ['ACTIVE'],
      }),
    ).toEqual([]);
    expect(
      requestedServiceLifecycles({ visibleLifecycles: ['ACTIVE'] }),
    ).toEqual(['ACTIVE']);
  });
});
