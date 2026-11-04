import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { playbookSharedReadScopeWhere, responseTemplateSharedReadScopeWhere } from './management-read-where';

const context = (serviceIds: readonly (string | null)[], isSuperAdmin = false): AuthorizationContext => ({
  subjectId: 'manager-1',
  isLocalOnly: false,
  isSuperAdmin,
  assignments: serviceIds.map((serviceId) => ({
    roleKey: 'ADMIN',
    permissionKeys: [permissionKeys.ticketTemplatesManage],
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId,
  })),
});

describe('shared management read scope predicates', () => {
  it('requires every template service to be allowed and excludes category/group scopes', () => {
    expect(responseTemplateSharedReadScopeWhere(context(['service-b', 'service-a', 'service-a']))).toEqual({
      services: {
        some: { serviceId: { in: ['service-a', 'service-b'] } },
        every: { serviceId: { in: ['service-a', 'service-b'] } },
      },
      categories: { none: {} },
      groups: { none: {} },
    });
  });

  it('applies the same service/category constraints to playbooks', () => {
    expect(playbookSharedReadScopeWhere(context(['service-a']))).toEqual({
      services: {
        some: { serviceId: { in: ['service-a'] } },
        every: { serviceId: { in: ['service-a'] } },
      },
      categories: { none: {} },
    });
  });

  it('returns no additional predicate to an unrestricted manager or super admin', () => {
    expect(responseTemplateSharedReadScopeWhere(context([null]))).toBeNull();
    expect(playbookSharedReadScopeWhere(context([], true))).toBeNull();
  });

  it('creates an impossible service predicate when no manage assignment exists', () => {
    expect(responseTemplateSharedReadScopeWhere(context([]))).toEqual({
      services: { some: { serviceId: { in: [] } }, every: { serviceId: { in: [] } } },
      categories: { none: {} },
      groups: { none: {} },
    });
  });
});
