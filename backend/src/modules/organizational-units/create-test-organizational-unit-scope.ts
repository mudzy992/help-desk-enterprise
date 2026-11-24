import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import type { OrganizationalUnitAuditContext } from './organizational-unit-delete.types';

/*
  W2.9 (`BA-organizational-units-01`): the service now refuses a user mapping or
  a reparent that the actor's scope does not cover, so a test that exercises the
  "allowed" path has to supply an actor that is allowed. These helpers keep that
  single, explicit and greppable instead of hiding it in every fixture.
*/

export const testOrganizationalUnitAdminContext: OrganizationalUnitAuditContext = {
  actorUserId: 'admin-1',
  requestId: 'request-1',
};

/** A global (unscoped) ADMIN grant, i.e. an installation administrator. */
export function createTestOrganizationalUnitScopeLoader(
  context: ReturnType<typeof createTestAuthorizationContext> | null = createTestAuthorizationContext({
    subjectId: 'admin-1',
    isLocalOnly: true,
    assignments: [
      createTestAssignment({
        roleKey: authorizationRoleKeys.admin,
        permissionKeys: [permissionKeys.organizationalUnitManage],
      }),
    ],
  }),
): { loadBySubjectId: (subjectId: string) => Promise<typeof context> } {
  return { loadBySubjectId: async () => context };
}
