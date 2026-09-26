import type { PrismaService } from '../../../common/prisma/prisma.service';
import { invalidateOrganizationalUnitScopeCache } from '../../../common/cache/scope-catalog-cache';
import type { DirectorySyncPlan } from './directory-sync-plan.types';

export type DirectorySyncApplyHooks = {
  /** Drops cached principal contexts (roles, unit, active flag changed). */
  readonly invalidateUsers: (userIds: readonly string[]) => Promise<unknown>;
  /** Revokes every session of deactivated users. */
  readonly revokeSessions: (userIds: readonly string[]) => Promise<unknown>;
};

export type DirectorySyncApplyResult = {
  readonly unitsCreated: number;
  readonly unitsUpdated: number;
  readonly usersCreated: number;
  readonly usersUpdated: number;
  readonly usersReactivated: number;
  readonly usersDeactivated: number;
  readonly rolesGranted: number;
  readonly rolesRevoked: number;
  readonly failures: readonly { readonly step: string; readonly email: string | null; readonly path: string | null }[];
};

type UnitType = 'DIRECTORATE' | 'BRANCH' | 'OFFICE' | 'SECTOR' | 'SERVICE';

/**
 * Paket 1.8 (A4): executes a plan row by row. A failing row (e.g. an e-mail
 * taken since the dry-run) is recorded and skipped; the rest still applies.
 * Local accounts are excluded at every write (`isLocalOnly: false` guard).
 */
export async function applyDirectorySyncPlan(
  prisma: PrismaService,
  plan: DirectorySyncPlan,
  hooks: DirectorySyncApplyHooks,
  now: Date,
): Promise<DirectorySyncApplyResult> {
  const failures: { step: string; email: string | null; path: string | null }[] = [];
  const counts = {
    unitsCreated: 0, unitsUpdated: 0, usersCreated: 0, usersUpdated: 0,
    usersReactivated: 0, usersDeactivated: 0, rolesGranted: 0, rolesRevoked: 0,
  };
  const touched = new Set<string>();

  const unitIdByPath = async (path: string | null): Promise<string | null> => {
    if (path === null) return null;
    const unit = await prisma.organizationalUnit.findUnique({ where: { ouPath: path }, select: { id: true } });
    return unit?.id ?? null;
  };

  for (const unit of plan.organizationalUnits.create) {
    try {
      await prisma.organizationalUnit.create({
        data: {
          name: unit.name,
          type: unit.type as UnitType,
          distinguishedName: unit.distinguishedName,
          ouPath: unit.path,
          parentId: await unitIdByPath(unit.parentPath),
        },
      });
      counts.unitsCreated += 1;
    } catch {
      failures.push({ step: 'unit.create', email: null, path: unit.path });
    }
  }
  for (const unit of plan.organizationalUnits.update) {
    try {
      await prisma.organizationalUnit.update({
        where: { id: unit.id },
        data: {
          name: unit.name,
          distinguishedName: unit.distinguishedName,
          ouPath: unit.path,
          parentId: await unitIdByPath(unit.parentPath),
        },
      });
      counts.unitsUpdated += 1;
    } catch {
      failures.push({ step: 'unit.update', email: null, path: unit.path });
    }
  }
  if (counts.unitsCreated + counts.unitsUpdated > 0) {
    invalidateOrganizationalUnitScopeCache();
  }

  const userRole = await ensureRole(prisma, 'USER', 'User');
  for (const user of plan.users.create) {
    try {
      const created = await prisma.user.create({
        data: {
          email: user.email,
          displayName: user.displayName,
          distinguishedName: user.distinguishedName,
          company: user.company,
          department: user.department,
          directoryObjectGuid: user.guid,
          directorySyncedAt: now,
          organizationalUnitId: await unitIdByPath(user.ouPath),
          isLocalOnly: false,
          isActive: true,
          userRoles: { create: { roleId: userRole } },
        },
        select: { id: true },
      });
      counts.usersCreated += 1;
      touched.add(created.id);
    } catch {
      failures.push({ step: 'user.create', email: user.email, path: user.ouPath });
    }
  }

  for (const [list, reactivating] of [[plan.users.update, false], [plan.users.reactivate, true]] as const) {
    for (const user of list) {
      try {
        const organizationalUnitId = user.ouPath === null ? undefined : await unitIdByPath(user.ouPath);
        const result = await prisma.user.updateMany({
          where: { id: user.userId, isLocalOnly: false },
          data: {
            email: user.email,
            displayName: user.displayName,
            distinguishedName: user.distinguishedName,
            company: user.company,
            department: user.department,
            directoryObjectGuid: user.guid,
            directorySyncedAt: now,
            ...(organizationalUnitId === undefined ? {} : { organizationalUnitId }),
            ...(reactivating ? { isActive: true, directoryDeactivatedAt: null } : {}),
          },
        });
        if (result.count !== 1) throw new Error('not updated');
        if (reactivating) counts.usersReactivated += 1;
        else counts.usersUpdated += 1;
        touched.add(user.userId);
      } catch {
        failures.push({ step: reactivating ? 'user.reactivate' : 'user.update', email: user.email, path: user.ouPath });
      }
    }
  }

  const deactivated: string[] = [];
  for (const user of plan.users.deactivate) {
    const result = await prisma.user.updateMany({
      where: { id: user.userId, isLocalOnly: false, isActive: true },
      data: { isActive: false, directoryDeactivatedAt: now, directorySyncedAt: now },
    });
    if (result.count === 1) {
      counts.usersDeactivated += 1;
      deactivated.push(user.userId);
      touched.add(user.userId);
    }
  }

  const roleIds = new Map<string, string>();
  for (const grant of plan.roles.grant) {
    try {
      const roleId = roleIds.get(grant.roleKey) ?? (await ensureRole(prisma, grant.roleKey, grant.roleKey === 'ADMIN' ? 'Admin' : 'Agent'));
      roleIds.set(grant.roleKey, roleId);
      const user = grant.userId !== null
        ? { id: grant.userId }
        : await prisma.user.findUnique({ where: { email: grant.email }, select: { id: true } });
      const organizationalUnitId = await unitIdByPath(grant.ouPath);
      if (user === null || organizationalUnitId === null) throw new Error('missing target');
      await prisma.userRole.create({ data: { userId: user.id, roleId, organizationalUnitId } });
      counts.rolesGranted += 1;
      touched.add(user.id);
    } catch {
      failures.push({ step: 'role.grant', email: grant.email, path: grant.ouPath });
    }
  }
  for (const revoke of plan.roles.revoke) {
    // Never SUPER_ADMIN, whatever the plan says.
    const result = await prisma.userRole.deleteMany({
      where: { id: revoke.userRoleId, role: { key: { in: ['ADMIN', 'AGENT'] } } },
    });
    if (result.count === 1) {
      counts.rolesRevoked += 1;
      touched.add(revoke.userId);
    }
  }

  if (deactivated.length > 0) await hooks.revokeSessions(deactivated);
  if (touched.size > 0) await hooks.invalidateUsers([...touched]);
  return { ...counts, failures };
}

async function ensureRole(prisma: PrismaService, key: string, name: string): Promise<string> {
  const role = await prisma.role.upsert({
    where: { key },
    create: { key, name, isSystem: true },
    update: {},
    select: { id: true },
  });
  return role.id;
}
