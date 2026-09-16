import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import {
  createAuthorizationLookups,
  type AuthorizationLookups,
} from '../authorization/evaluate-authorization-request';

export function createProposedRolePermissionLookups(
  authorizationContextLoader: AuthorizationContextLoader,
  prisma: PrismaService,
  roleKey: string,
  proposedPermissionKeys: readonly string[],
): AuthorizationLookups {
  const base = createAuthorizationLookups(authorizationContextLoader, prisma);
  return {
    ...base,
    loadBySubjectId: async (subjectId) => {
      const context = await base.loadBySubjectId(subjectId);
      if (context === null) {
        return null;
      }
      return {
        ...context,
        assignments: context.assignments.map((assignment) =>
          assignment.roleKey === roleKey
            ? { ...assignment, permissionKeys: proposedPermissionKeys }
            : assignment,
        ),
      };
    },
  };
}
