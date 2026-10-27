import { permissionKeys } from '../authorization/authorization.constants';
import { readSlaReadScope, slaRuleScopeWhere } from './sla-read-scope';
import type { PrincipalAssignment } from '../../common/principal-context/principal-context.types';

const requestFor = (assignments: PrincipalAssignment[]): Parameters<typeof readSlaReadScope>[0] => ({
  principalContext: {
    subjectId: 'user-1', email: 'u@example.test', displayName: 'U', isActive: true,
    isLocalOnly: true, mustChangePassword: false, entraObjectId: null,
    roleKeys: ['ADMIN'], groupIds: [], homeOrganizationalUnitId: null,
    assignments, authzVersion: 1,
  },
});

describe('SLA read scope', () => {
  it('derives global read without treating scoped assignments as global', () => {
    expect(readSlaReadScope(requestFor([{ roleKey: 'ADMIN', permissionKeys: [permissionKeys.slaRead], organizationalUnitId: null, organizationalUnitPath: null, serviceId: null }]))).toMatchObject({ global: true });
    expect(readSlaReadScope(requestFor([{ roleKey: 'ADMIN', permissionKeys: [permissionKeys.slaRead], organizationalUnitId: 'ou-a', organizationalUnitPath: '/root/a/', serviceId: null }]))).toEqual({ global: false, organizationalUnitPaths: ['/root/a/'], serviceIds: [] });
  });

  it('builds DB-level OU subtree and service predicates', () => {
    const where = slaRuleScopeWhere({ global: false, organizationalUnitPaths: ['/root/a/'], serviceIds: ['service-1'] });
    expect(where).toEqual({ OR: [
      { organizationalUnitId: null, serviceId: null },
      { serviceId: { in: ['service-1'] } },
      { organizationalUnit: { ouPath: { startsWith: '/root/a/' } } },
    ] });
    expect(JSON.stringify(where)).not.toContain('/root/b/');
    expect(JSON.stringify(where)).not.toContain('service-2');
  });
});
