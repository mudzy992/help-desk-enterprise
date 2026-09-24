import type { PrismaService } from '../prisma/prisma.service';
import type {
  PrincipalAssignment,
  PrincipalContext,
} from './principal-context.types';

/**
 * The single read behind every authorization decision (plan §2.2).
 *
 * It is the union of the two queries that used to run back to back — the
 * session guard's user record and the authorization loader's user + roles +
 * permissions + OU/service — plus the group memberships the authorization
 * decision needs. One row, one statement.
 */
export const principalContextInclude = {
  userRoles: {
    include: {
      role: {
        select: {
          key: true,
          rolePermissions: {
            select: { permission: { select: { key: true } } },
          },
        },
      },
      organizationalUnit: { select: { id: true, ouPath: true } },
      service: { select: { id: true } },
    },
  },
  groupMembers: { select: { groupId: true } },
} as const;

type LoadedPrincipalUser = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  isLocalOnly: boolean;
  mustChangePassword: boolean;
  entraObjectId: string | null;
  authzVersion: number;
  organizationalUnitId: string | null;
  userRoles: readonly {
    role: {
      key: string;
      rolePermissions: readonly { permission: { key: string } }[];
    };
    organizationalUnit: { id: string; ouPath: string } | null;
    service: { id: string } | null;
  }[];
  groupMembers: readonly { groupId: string }[];
};

export function mapPrincipalUser(user: LoadedPrincipalUser): PrincipalContext {
  const assignments: readonly PrincipalAssignment[] = user.userRoles.map(
    (userRole) => ({
      roleKey: userRole.role.key,
      permissionKeys: userRole.role.rolePermissions.map(
        (rolePermission) => rolePermission.permission.key,
      ),
      organizationalUnitId: userRole.organizationalUnit?.id ?? null,
      organizationalUnitPath: userRole.organizationalUnit?.ouPath ?? null,
      serviceId: userRole.service?.id ?? null,
    }),
  );
  return {
    subjectId: user.id,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    isLocalOnly: user.isLocalOnly,
    mustChangePassword: user.mustChangePassword,
    entraObjectId: user.entraObjectId,
    // Roles are the distinct keys of the assignments (a user may hold the same
    // role in two units) — the same list the authentication loader built.
    roleKeys: [
      ...new Set(assignments.map((assignment) => assignment.roleKey)),
    ],
    groupIds: [...new Set(user.groupMembers.map((member) => member.groupId))],
    homeOrganizationalUnitId: user.organizationalUnitId,
    assignments,
    authzVersion: user.authzVersion,
  };
}

export async function loadPrincipalContext(
  prisma: PrismaService,
  subjectId: string,
): Promise<PrincipalContext | null> {
  const id = subjectId.trim();
  if (id.length === 0) {
    return null;
  }
  const user = (await prisma.user.findUnique({
    where: { id },
    include: principalContextInclude,
  })) as LoadedPrincipalUser | null;
  return user === null ? null : mapPrincipalUser(user);
}
