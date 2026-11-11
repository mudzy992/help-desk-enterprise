import type { PrincipalAssignment } from '../../common/principal-context/principal-context.types';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import {
  allServiceLifecycles,
  isServiceLifecycleVisible,
  requestedServiceLifecycles,
  serviceListVisibilityForPrincipal,
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

  it('globalni ADMIN/SuperAdmin dobija globalne lifecycle statuse', () => {
    expect(
      serviceListVisibilityForPrincipal(
        principal([authorizationRoleKeys.admin], [assignment(authorizationRoleKeys.admin)]),
      ),
    ).toEqual({ visibleLifecycles: allServiceLifecycles });
    expect(
      serviceListVisibilityForPrincipal(
        principal(
          [authorizationRoleKeys.superAdmin],
          [assignment(authorizationRoleKeys.superAdmin)],
          true,
        ),
      ),
    ).toEqual({ visibleLifecycles: allServiceLifecycles });
  });

  it('ograničava nacrte service-scoped ADMIN-a na dodijeljene servise', () => {
    expect(
      serviceListVisibilityForPrincipal(
        principal(
          [authorizationRoleKeys.agent, authorizationRoleKeys.admin],
          [
            assignment(authorizationRoleKeys.agent),
            assignment(authorizationRoleKeys.admin, { serviceId: 'service-2' }),
            assignment(authorizationRoleKeys.admin, { serviceId: 'service-1' }),
            assignment(authorizationRoleKeys.admin, { serviceId: 'service-1' }),
          ],
        ),
      ),
    ).toEqual({
      visibleLifecycles: ['ACTIVE', 'DEPRECATED'],
      scopedServiceIds: ['service-1', 'service-2'],
    });
  });

  it('OU-only ADMIN ne dobija globalnu draft vidljivost bez service mapiranja', () => {
    expect(
      serviceListVisibilityForPrincipal(
        principal(
          [authorizationRoleKeys.user, authorizationRoleKeys.admin],
          [
            assignment(authorizationRoleKeys.user),
            assignment(authorizationRoleKeys.admin, {
              organizationalUnitId: 'ou-1',
              organizationalUnitPath: 'root/department',
            }),
          ],
        ),
      ),
    ).toEqual({ visibleLifecycles: ['ACTIVE'] });
  });

  it('ne širi service-scoped ADMIN na katalog kada postoji i globalni USER', () => {
    expect(
      serviceListVisibilityForPrincipal(
        principal(
          [authorizationRoleKeys.user, authorizationRoleKeys.admin],
          [
            assignment(authorizationRoleKeys.user),
            assignment(authorizationRoleKeys.admin, { serviceId: 'service-1' }),
          ],
        ),
      ),
    ).toEqual({
      visibleLifecycles: ['ACTIVE'],
      scopedServiceIds: ['service-1'],
    });
  });

  it('bez principal contexta fail-closed samo na ACTIVE', () => {
    expect(serviceListVisibilityForPrincipal(null)).toEqual({
      visibleLifecycles: ['ACTIVE'],
    });
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

function principal(
  roleKeys: readonly string[],
  assignments: readonly PrincipalAssignment[],
  isLocalOnly = false,
) {
  return { roleKeys, assignments, isLocalOnly };
}

function assignment(
  roleKey: string,
  scope: Partial<
    Pick<
      PrincipalAssignment,
      'organizationalUnitId' | 'organizationalUnitPath' | 'serviceId'
    >
  > = {},
): PrincipalAssignment {
  return {
    roleKey,
    permissionKeys: [],
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    ...scope,
  };
}
