import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { scopeAgnosticPermissionKeys } from '../authorization/authorization.constants';
import { createAuthorizationLookups } from '../authorization/evaluate-authorization-request';
import type { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import { assertKnownPermissionKeys } from './assert-known-permission-keys';
import { createProposedRolePermissionLookups } from './create-proposed-role-permission-lookups';
import { getRolePermissions } from './get-role-permissions';
import { loadRoleByKey } from './load-role-by-key';
import {
  rolePermissionPreviewScopeKinds,
  type RolePermissionPreviewResponse,
  type RolePermissionPreviewSample,
  type RolePermissionPreviewScope,
  type RolePermissionPreviewScopeImpacts,
} from './rbac.types';
import {
  rolePermissionPreviewTokenTtlSeconds,
  signRolePermissionPreviewToken,
} from './role-permission-preview-token';

const previewSampleLimit = 3;
// Bounded scan: a role can hold thousands of assignments, and the report only
// needs the first flips plus the counters.
const previewAssignmentScanLimit = 250;
// W2.33 (`BA-rbac-06`): the preview evaluates **people**, so the bound is on
// distinct holders. The row window above is wider than this on purpose: one
// person can hold the role in several OU/service scopes, and all of their
// assignments decide what that person actually loses.
const previewUserLimit = 25;

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

type ScopedAssignment = {
  readonly id: string;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly ouPath: string;
  } | null;
  readonly service: { readonly id: string; readonly name: string } | null;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
  };
};

const globalPreviewScope: RolePermissionPreviewScope = {
  kind: rolePermissionPreviewScopeKinds.global,
  organizationalUnitId: null,
  organizationalUnitName: null,
  organizationalUnitPath: null,
  serviceId: null,
  serviceName: null,
};

/**
 * W2.31 (`BA-rbac-03`): the scope a decision must be evaluated in is the scope
 * of the **assignment**, not the absence of scope. An OU-scoped assignment is
 * denied by construction on a global check (`evaluate-authorization-access`
 * deliberately refuses scoped grants when no scope is requested), so evaluating
 * everything globally hid every real OU/service effect.
 */
function assignmentPreviewScope(
  assignment: ScopedAssignment,
): RolePermissionPreviewScope {
  const hasOrganizationalUnit = assignment.organizationalUnitId !== null;
  const hasService = assignment.serviceId !== null;
  const kind =
    hasOrganizationalUnit && hasService
      ? rolePermissionPreviewScopeKinds.organizationalUnitAndService
      : hasOrganizationalUnit
        ? rolePermissionPreviewScopeKinds.organizationalUnit
        : hasService
          ? rolePermissionPreviewScopeKinds.service
          : rolePermissionPreviewScopeKinds.global;
  return {
    kind,
    organizationalUnitId: assignment.organizationalUnitId,
    organizationalUnitName: assignment.organizationalUnit?.name ?? null,
    organizationalUnitPath: assignment.organizationalUnit?.ouPath ?? null,
    serviceId: assignment.serviceId,
    serviceName: assignment.service?.name ?? null,
  };
}

/**
 * One assignment can be affected in more than one context. Its own scope is
 * always evaluated; a scope-agnostic permission (`oncall.read`, `oncall.manage`)
 * is additionally evaluated globally, because that is where such a grant
 * actually applies — the evaluator ignores the scope for those keys.
 */
function previewScopesFor(
  assignment: ScopedAssignment,
  permissionKey: string,
): readonly RolePermissionPreviewScope[] {
  const own = assignmentPreviewScope(assignment);
  if (own.kind === rolePermissionPreviewScopeKinds.global) {
    return [own];
  }
  if (scopeAgnosticPermissionKeys.includes(permissionKey)) {
    return [own, globalPreviewScope];
  }
  return [own];
}

function requirementsForScope(
  permissionKey: string,
  scope: RolePermissionPreviewScope,
): {
  requiredRoles: readonly string[];
  requiredPermissions: readonly string[];
  organizationalUnitScope: null;
  serviceScope: null;
  requireOrganizationalUnitScope: boolean;
  requireServiceScope: boolean;
} {
  return {
    requiredRoles: [],
    requiredPermissions: [permissionKey],
    organizationalUnitScope: null,
    serviceScope: null,
    requireOrganizationalUnitScope: scope.organizationalUnitId !== null,
    requireServiceScope: scope.serviceId !== null,
  };
}

/**
 * W2.33 (`BA-rbac-06`): one row per person, in the deterministic order the query
 * already produced. A holder with several scoped assignments keeps all of them —
 * dropping the rows would under-report the effect — but only the first
 * `previewUserLimit` people are evaluated, so the cost stays bounded by people
 * rather than by grants.
 */
function assignmentsForDistinctUsers(
  assignments: readonly ScopedAssignment[],
): readonly ScopedAssignment[] {
  const selected: ScopedAssignment[] = [];
  const users = new Set<string>();
  for (const assignment of assignments) {
    if (!users.has(assignment.user.id)) {
      if (users.size >= previewUserLimit) {
        continue;
      }
      users.add(assignment.user.id);
    }
    selected.push(assignment);
  }
  return selected;
}

function emptyScopeImpacts(): Record<keyof RolePermissionPreviewScopeImpacts, number> {
  return {
    [rolePermissionPreviewScopeKinds.global]: 0,
    [rolePermissionPreviewScopeKinds.organizationalUnit]: 0,
    [rolePermissionPreviewScopeKinds.service]: 0,
    [rolePermissionPreviewScopeKinds.organizationalUnitAndService]: 0,
  };
}

export async function previewRolePermissionImpact(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly shadowAuthorizationService: ShadowAuthorizationService;
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  /** Paket 5.1 (M4 B2): pregled je vezan za onoga ko ga je pokrenuo. */
  readonly actorUserId: string | null;
  /** Isti secret kojim se potpisuju sesije (`JwtSigningSecretLoader`). */
  readonly signingSecret: string;
}): Promise<RolePermissionPreviewResponse> {
  const role = await loadRoleByKey(input.prisma, input.roleKey);
  const currentPermissionKeys = await getRolePermissions(input.prisma, role.key);
  const proposedPermissionKeys = assertKnownPermissionKeys(input.permissionKeys);
  const { added, removed } = diffPermissionKeys(
    currentPermissionKeys,
    proposedPermissionKeys,
  );
  const scannedAssignments = (await input.prisma.userRole.findMany({
    where: { roleId: role.id },
    select: {
      id: true,
      organizationalUnitId: true,
      serviceId: true,
      organizationalUnit: { select: { id: true, name: true, ouPath: true } },
      service: { select: { id: true, name: true } },
      user: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: [{ user: { displayName: 'asc' } }, { id: 'asc' }],
    take: previewAssignmentScanLimit,
  })) as readonly ScopedAssignment[];
  const affectedAssignments = assignmentsForDistinctUsers(scannedAssignments);
  const affectedAssignmentCount = await input.prisma.userRole.count({
    where: { roleId: role.id },
  });
  // W2.33 (`BA-rbac-06`): `count` counts rows, so the same person with the same
  // role in two scopes was reported as two people. `groupBy` answers the
  // question the report actually asks.
  const affectedUsers = await input.prisma.userRole.groupBy({
    by: ['userId'],
    where: { roleId: role.id },
  });
  const affectedUserCount = affectedUsers.length;
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
  const scopeImpacts = emptyScopeImpacts();
  const samples: RolePermissionPreviewSample[] = [];
  const sampledUserIds = new Set<string>();
  for (const assignment of affectedAssignments) {
    const principal = {
      subjectId: assignment.user.id,
      email: assignment.user.email,
      displayName: assignment.user.displayName,
      isLocalOnly: false,
    };
    for (const permissionKey of changedKeys) {
      for (const scope of previewScopesFor(assignment, permissionKey)) {
        const requirements = requirementsForScope(permissionKey, scope);
        const before = await input.shadowAuthorizationService.evaluateWithLookups(
          {
            principal,
            requirements,
            organizationalUnitId: scope.organizationalUnitId,
            serviceId: scope.serviceId,
          },
          beforeLookups,
        );
        const after = await input.shadowAuthorizationService.evaluateWithLookups(
          {
            principal,
            requirements,
            organizationalUnitId: scope.organizationalUnitId,
            serviceId: scope.serviceId,
          },
          afterLookups,
        );
        if (before.decision === after.decision) {
          continue;
        }
        // Counted for every changed decision, not only for the three that are
        // shown — the counter is what tells an administrator the size of the
        // OU/service blast radius.
        scopeImpacts[scope.kind] += 1;
        if (samples.length >= previewSampleLimit) {
          continue;
        }
        // W2.33 (`BA-rbac-06`): three samples of the same person are not a
        // sample of the affected users. The decision is still counted above;
        // only the illustration is limited to one row per person.
        if (sampledUserIds.has(assignment.user.id)) {
          continue;
        }
        sampledUserIds.add(assignment.user.id);
        samples.push({
          userId: assignment.user.id,
          displayName: assignment.user.displayName,
          email: assignment.user.email,
          assignmentId: assignment.id,
          permissionKey,
          scope,
          before,
          after,
        });
      }
    }
  }
  // W2.30 (BA-rbac-02): the preview is recorded, not only signed. `jti` is the
  // single-use claim the write consumes; the trim keeps the table bounded by the
  // 15-minute TTL without a scheduler.
  const issuedAt = new Date();
  await input.prisma.rolePermissionPreviewClaim.deleteMany({
    where: { expiresAt: { lt: issuedAt } },
  });
  const jti = randomUUID();
  await input.prisma.rolePermissionPreviewClaim.create({
    data: {
      jti,
      roleKey: role.key,
      actorUserId: input.actorUserId,
      expiresAt: new Date(
        issuedAt.getTime() + rolePermissionPreviewTokenTtlSeconds * 1000,
      ),
    },
  });
  return {
    // Paket 5.1 (M4 B2): dokaz koji `PUT` mora vratiti; potpis pokriva tačan
    // skup permisija, ulogu, pregledača i rok (15 minuta).
    // BA-rbac-01 (W2.29): potpis pokriva i baseline — skup koji je uloga imala
    // sada. `PUT` ga poredi sa stanjem u transakciji, pa pregled stariji od tuđe
    // izmjene više ne može tiho prepisati tu izmjenu.
    previewToken: signRolePermissionPreviewToken(
      {
        jti,
        roleKey: role.key,
        permissionKeys: proposedPermissionKeys,
        baselinePermissionKeys: currentPermissionKeys,
        actorUserId: input.actorUserId,
      },
      input.signingSecret,
    ),
    roleKey: role.key,
    currentPermissionKeys,
    proposedPermissionKeys,
    addedPermissionKeys: added,
    removedPermissionKeys: removed,
    affectedUserCount,
    affectedAssignmentCount,
    scopeImpacts,
    samples,
  };
}
