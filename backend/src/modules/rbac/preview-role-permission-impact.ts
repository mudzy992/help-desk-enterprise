import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { createAuthorizationLookups } from '../authorization/evaluate-authorization-request';
import type { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import { assertKnownPermissionKeys } from './assert-known-permission-keys';
import { createProposedRolePermissionLookups } from './create-proposed-role-permission-lookups';
import { getRolePermissions } from './get-role-permissions';
import { loadRoleByKey } from './load-role-by-key';
import type { RolePermissionPreviewResponse } from './rbac.types';

const previewSampleLimit = 3;

function diffPermissionKeys(
  current: readonly string[],
  proposed: readonly string[],
): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const currentSet = new Set(current);
  const proposedSet = new Set(proposed);
  return {
    added: proposed.filter((key) => !currentSet.has(key)),
    removed: current.filter((key) => !proposedSet.has(key)),
  };
}

export async function previewRolePermissionImpact(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly shadowAuthorizationService: ShadowAuthorizationService;
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
}): Promise<RolePermissionPreviewResponse> {
  const role = await loadRoleByKey(input.prisma, input.roleKey);
  const currentPermissionKeys = await getRolePermissions(input.prisma, role.key);
  const proposedPermissionKeys = assertKnownPermissionKeys(input.permissionKeys);
  const { added, removed } = diffPermissionKeys(
    currentPermissionKeys,
    proposedPermissionKeys,
  );
  const affectedUsers = await input.prisma.userRole.findMany({
    where: { roleId: role.id },
    select: {
      user: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { user: { displayName: 'asc' } },
    take: previewSampleLimit,
  });
  const affectedUserCount = await input.prisma.userRole.count({
    where: { roleId: role.id },
  });
  const beforeLookups = createAuthorizationLookups(
    input.authorizationContextLoader,
    input.prisma,
  );
  const afterLookups = createProposedRolePermissionLookups(
    input.authorizationContextLoader,
    input.prisma,
    role.key,
    proposedPermissionKeys,
  );
  const changedKeys = [...removed, ...added];
  const samples = [];
  for (const userRole of affectedUsers) {
    for (const permissionKey of changedKeys) {
      const principal = {
        subjectId: userRole.user.id,
        email: userRole.user.email,
        displayName: userRole.user.displayName,
        isLocalOnly: false,
      };
      const requirements = {
        requiredRoles: [],
        requiredPermissions: [permissionKey],
        organizationalUnitScope: null,
        serviceScope: null,
        requireOrganizationalUnitScope: false,
        requireServiceScope: false,
      };
      const before = await input.shadowAuthorizationService.evaluateWithLookups(
        {
          principal,
          requirements,
          organizationalUnitId: null,
          serviceId: null,
        },
        beforeLookups,
      );
      const after = await input.shadowAuthorizationService.evaluateWithLookups(
        {
          principal,
          requirements,
          organizationalUnitId: null,
          serviceId: null,
        },
        afterLookups,
      );
      if (before.decision === after.decision) {
        continue;
      }
      samples.push({
        userId: userRole.user.id,
        displayName: userRole.user.displayName,
        email: userRole.user.email,
        permissionKey,
        before,
        after,
      });
      if (samples.length >= previewSampleLimit) {
        break;
      }
    }
    if (samples.length >= previewSampleLimit) {
      break;
    }
  }
  return {
    roleKey: role.key,
    currentPermissionKeys,
    proposedPermissionKeys,
    addedPermissionKeys: added,
    removedPermissionKeys: removed,
    affectedUserCount,
    samples,
  };
}
