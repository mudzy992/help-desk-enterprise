import { classifyOrganizationalUnit } from './classify-organizational-unit';
import {
  normalizeDistinguishedNameForComparison,
  organizationalUnitPathFromDistinguishedName,
} from './distinguished-name';
import type {
  DirectorySyncException,
  DirectorySyncPlan,
  PlannedRoleGrant,
  PlannedRoleRevoke,
  PlannedUnitCreate,
  PlannedUnitUpdate,
  PlannedUserDeactivation,
  PlannedUserFields,
  PlannedUserUpdate,
} from './directory-sync-plan.types';
import type {
  LdapsDirectoryOrganizationalUnitEntry,
  LdapsDirectoryUserEntry,
  LdapsSyncConfiguration,
} from './ldaps-directory.types';
import {
  resolveUserOrganizationalUnit,
  type OrganizationalUnitCandidate,
} from './resolve-user-organizational-unit';

export type ExistingDirectoryUnit = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly distinguishedName: string;
  readonly path: string;
  readonly parentPath: string | null;
  readonly company: string | null;
  readonly department: string | null;
};

export type ExistingDirectoryUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly directoryObjectGuid: string | null;
  readonly directoryDeactivatedAt: string | null;
  readonly distinguishedName: string | null;
  readonly company: string | null;
  readonly department: string | null;
  readonly ouPath: string | null;
  /** Managed by the sync: non-local and linked to the directory (GUID or DN in scope). */
  readonly managed: boolean;
  /** ADMIN/AGENT assignments without a service scope (ad_groups mode). */
  readonly directoryRoles: readonly {
    readonly userRoleId: string;
    readonly roleKey: string;
    readonly ouPath: string | null;
  }[];
};

export type BuildDirectorySyncPlanInput = {
  readonly configuration: Pick<
    LdapsSyncConfiguration,
    | 'usersBaseDn'
    | 'ouMappingStrategy'
    | 'ouMappingOverrides'
    | 'roleSource'
    | 'adminGroupDn'
    | 'agentGroupDn'
    | 'maxDeactivationPercent'
  >;
  readonly directoryUnits: readonly LdapsDirectoryOrganizationalUnitEntry[];
  readonly directoryUsers: readonly LdapsDirectoryUserEntry[];
  readonly existingUnits: readonly ExistingDirectoryUnit[];
  readonly existingUsers: readonly ExistingDirectoryUser[];
};

/**
 * Paket 1.8 (A3/A4): pure diff between AD and the application. Nothing is
 * written here; the same plan is shown in the dry-run and executed on apply.
 */
export function buildDirectorySyncPlan(input: BuildDirectorySyncPlanInput): DirectorySyncPlan {
  const exceptions: DirectorySyncException[] = [];
  const units = planUnits(input, exceptions);
  const knownUnits = new Map<string, OrganizationalUnitCandidate>();
  for (const unit of input.existingUnits) {
    knownUnits.set(unit.path, { path: unit.path, company: unit.company, department: unit.department });
  }
  for (const unit of units.create) {
    knownUnits.set(unit.path, { path: unit.path, company: null, department: null });
  }

  const byGuid = new Map<string, ExistingDirectoryUser>();
  const byEmail = new Map<string, ExistingDirectoryUser>();
  for (const user of input.existingUsers) {
    if (user.directoryObjectGuid) byGuid.set(user.directoryObjectGuid, user);
    byEmail.set(user.email.toLowerCase(), user);
  }
  const emailCounts = new Map<string, number>();
  for (const user of input.directoryUsers) {
    if (user.email) emailCounts.set(user.email, (emailCounts.get(user.email) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const create: PlannedUserFields[] = [];
  const update: PlannedUserUpdate[] = [];
  const reactivate: PlannedUserUpdate[] = [];
  const deactivate: PlannedUserDeactivation[] = [];
  const grants: PlannedRoleGrant[] = [];
  const revokes: PlannedRoleRevoke[] = [];
  const claimedEmails = new Set<string>();
  let unchanged = 0;
  const unitCounts = new Map<string, number>();
  const rootDepth = (organizationalUnitPathFromDistinguishedName(input.configuration.usersBaseDn) ?? '/')
    .split('/')
    .filter(Boolean).length;

  for (const entry of input.directoryUsers) {
    const exception = (code: DirectorySyncException['code'], detail: string | null = null) =>
      exceptions.push({ code, distinguishedName: entry.distinguishedName, email: entry.email, detail });
    if (entry.guid === null) {
      exception('GUID_MISSING');
      continue;
    }
    let existing = byGuid.get(entry.guid) ?? null;
    if (existing !== null) seen.add(existing.id);
    if (entry.email === null) {
      exception('NO_EMAIL');
      continue;
    }
    if ((emailCounts.get(entry.email) ?? 0) > 1) {
      exception('DUPLICATE_EMAIL');
      continue;
    }
    if (existing === null) {
      const candidate = byEmail.get(entry.email) ?? null;
      if (candidate?.isLocalOnly) {
        exception('EMAIL_TAKEN_BY_LOCAL');
        continue;
      }
      // A non-local account with this e-mail but another GUID stays untouched.
      if (candidate !== null && candidate.directoryObjectGuid !== null) {
        exception('EMAIL_CONFLICT', 'guid');
        continue;
      }
      existing = candidate;
      if (existing !== null) seen.add(existing.id);
    }

    if (entry.disabled) {
      if (existing !== null && existing.isActive) {
        deactivate.push({ userId: existing.id, email: existing.email, displayName: existing.displayName, reason: 'disabled' });
      }
      continue;
    }

    const resolved = resolveUserOrganizationalUnit({
      user: entry,
      strategy: input.configuration.ouMappingStrategy,
      overrides: input.configuration.ouMappingOverrides,
      knownUnits,
    });
    if (resolved.path === null) exception('NO_OU_MATCH', organizationalUnitPathFromDistinguishedName(entry.distinguishedName));
    const topLevel = topLevelPath(resolved.path, rootDepth);
    if (topLevel !== null) unitCounts.set(topLevel, (unitCounts.get(topLevel) ?? 0) + 1);

    let email = entry.email;
    if (existing !== null && email !== existing.email.toLowerCase()) {
      const owner = byEmail.get(email);
      if ((owner !== undefined && owner.id !== existing.id) || claimedEmails.has(email)) {
        exception('EMAIL_CONFLICT', 'rename');
        email = existing.email;
      }
    }
    claimedEmails.add(email.toLowerCase());
    const fields: PlannedUserFields = {
      guid: entry.guid,
      email,
      displayName: entry.displayName,
      distinguishedName: entry.distinguishedName,
      company: entry.company,
      department: entry.department,
      ouPath: resolved.path,
    };

    if (existing === null) {
      create.push(fields);
    } else {
      const changes = diffUser(existing, fields);
      if (!existing.isActive && existing.directoryDeactivatedAt !== null) {
        reactivate.push({ ...fields, userId: existing.id, changes: [...changes, 'isActive'] });
      } else {
        if (!existing.isActive) exception('KEPT_INACTIVE_BY_ADMIN');
        if (changes.length > 0) update.push({ ...fields, userId: existing.id, changes });
        else unchanged += 1;
      }
    }

    if (input.configuration.roleSource === 'ad_groups') {
      planRoles({
        entry,
        existing,
        email,
        ouPath: resolved.path ?? existing?.ouPath ?? null,
        configuration: input.configuration,
        grants,
        revokes,
        onMissingOu: () => exception('ROLE_WITHOUT_OU'),
      });
    }
  }

  for (const user of input.existingUsers) {
    if (user.managed && user.isActive && !user.isLocalOnly && !seen.has(user.id)) {
      deactivate.push({ userId: user.id, email: user.email, displayName: user.displayName, reason: 'missing' });
    }
  }

  const activeManagedUsers = input.existingUsers.filter((user) => user.managed && user.isActive).length;
  const percent = activeManagedUsers === 0 ? 0 : (deactivate.length / activeManagedUsers) * 100;
  const limitPercent = input.configuration.maxDeactivationPercent;
  return {
    organizationalUnits: units,
    users: { create, update, reactivate, deactivate, unchanged },
    roles: { grant: grants, revoke: revokes },
    exceptions,
    unitCounts: [...unitCounts.entries()]
      .map(([path, users]) => ({ path, users }))
      .sort((left, right) => left.path.localeCompare(right.path, 'bs')),
    safeguard: {
      activeManagedUsers,
      deactivations: deactivate.length,
      percent: Math.round(percent * 10) / 10,
      limitPercent,
      tripped: activeManagedUsers > 0 && deactivate.length > 0 && percent > limitPercent,
    },
    totals: {
      directoryUsers: input.directoryUsers.length,
      directoryUnits: input.directoryUnits.length,
    },
  };
}

function planUnits(
  input: BuildDirectorySyncPlanInput,
  exceptions: DirectorySyncException[],
): { create: PlannedUnitCreate[]; update: PlannedUnitUpdate[] } {
  const rootPath = organizationalUnitPathFromDistinguishedName(input.configuration.usersBaseDn) ?? '/';
  const byDn = new Map(
    input.existingUnits.map((unit) => [normalizeDistinguishedNameForComparison(unit.distinguishedName), unit]),
  );
  const byPath = new Map(input.existingUnits.map((unit) => [unit.path, unit]));
  const create: PlannedUnitCreate[] = [];
  const update: PlannedUnitUpdate[] = [];
  const directoryDns = new Set<string>();
  const sorted = [...input.directoryUnits].sort(
    (left, right) => left.path.split('/').length - right.path.split('/').length,
  );
  for (const unit of sorted) {
    const key = normalizeDistinguishedNameForComparison(unit.distinguishedName);
    directoryDns.add(key);
    const planned: PlannedUnitCreate = {
      distinguishedName: unit.distinguishedName,
      path: unit.path,
      name: unit.name,
      type: classifyOrganizationalUnit({ path: unit.path, rootPath }),
      parentPath: parentPath(unit.path),
    };
    const existing = byDn.get(key) ?? byPath.get(unit.path);
    if (existing === undefined) {
      create.push(planned);
      continue;
    }
    // The type is set once; admins may refine it afterwards.
    const changes: string[] = [];
    if (existing.name !== planned.name) changes.push('name');
    if (existing.path !== planned.path) changes.push('path');
    if (existing.parentPath !== planned.parentPath) changes.push('parent');
    if (existing.distinguishedName !== planned.distinguishedName) changes.push('distinguishedName');
    if (changes.length > 0) {
      update.push({ ...planned, type: existing.type, id: existing.id, changes });
    }
  }
  for (const unit of input.existingUnits) {
    const key = normalizeDistinguishedNameForComparison(unit.distinguishedName);
    const base = normalizeDistinguishedNameForComparison(input.configuration.usersBaseDn);
    if ((key === base || key.endsWith(`,${base}`)) && !directoryDns.has(key)) {
      exceptions.push({ code: 'OU_NOT_IN_DIRECTORY', distinguishedName: unit.distinguishedName, email: null, detail: unit.path });
    }
  }
  return { create, update };
}

function planRoles(input: {
  readonly entry: LdapsDirectoryUserEntry;
  readonly existing: ExistingDirectoryUser | null;
  readonly email: string;
  readonly ouPath: string | null;
  readonly configuration: BuildDirectorySyncPlanInput['configuration'];
  readonly grants: PlannedRoleGrant[];
  readonly revokes: PlannedRoleRevoke[];
  readonly onMissingOu: () => void;
}): void {
  const memberOf = new Set(input.entry.memberOf.map(normalizeDistinguishedNameForComparison));
  const isMember = (dn: string | null) => dn !== null && memberOf.has(normalizeDistinguishedNameForComparison(dn));
  const desired: ('ADMIN' | 'AGENT')[] = [];
  if (isMember(input.configuration.adminGroupDn)) desired.push('ADMIN');
  if (isMember(input.configuration.agentGroupDn)) desired.push('AGENT');
  const current = input.existing?.directoryRoles ?? [];
  if (desired.length > 0 && input.ouPath === null) {
    input.onMissingOu();
  }
  for (const roleKey of desired) {
    if (input.ouPath === null) continue;
    if (!current.some((role) => role.roleKey === roleKey && role.ouPath === input.ouPath)) {
      input.grants.push({ userId: input.existing?.id ?? null, email: input.email, roleKey, ouPath: input.ouPath });
    }
  }
  for (const role of current) {
    const keep = desired.includes(role.roleKey as 'ADMIN' | 'AGENT') && role.ouPath === input.ouPath;
    if (!keep && input.existing !== null) {
      input.revokes.push({ userRoleId: role.userRoleId, userId: input.existing.id, email: input.existing.email, roleKey: role.roleKey });
    }
  }
}

function diffUser(existing: ExistingDirectoryUser, fields: PlannedUserFields): string[] {
  const changes: string[] = [];
  if (existing.displayName !== fields.displayName) changes.push('displayName');
  if (existing.email.toLowerCase() !== fields.email.toLowerCase()) changes.push('email');
  if (existing.distinguishedName !== fields.distinguishedName) changes.push('distinguishedName');
  if ((existing.company ?? null) !== fields.company) changes.push('company');
  if ((existing.department ?? null) !== fields.department) changes.push('department');
  if (fields.ouPath !== null && existing.ouPath !== fields.ouPath) changes.push('organizationalUnit');
  if (existing.directoryObjectGuid !== fields.guid) changes.push('directoryObjectGuid');
  return changes;
}

function parentPath(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  return segments.length <= 1 ? null : `/${segments.slice(0, -1).join('/')}`;
}

function topLevelPath(path: string | null, rootDepth: number): string | null {
  if (path === null) return null;
  const segments = path.split('/').filter(Boolean);
  return `/${segments.slice(0, Math.min(segments.length, rootDepth + 1)).join('/')}`;
}
