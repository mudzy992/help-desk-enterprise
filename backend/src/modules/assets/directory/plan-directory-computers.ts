import {
  isDistinguishedNameWithin,
  normalizeDistinguishedNameForComparison,
  organizationalUnitPathFromDistinguishedName,
  parentDistinguishedName,
} from '../../directory-sync/ldaps/distinguished-name';
import type { LdapsDirectoryComputerEntry, OrganizationalUnitMappingOverride } from '../../directory-sync/ldaps/ldaps-directory.types';

/**
 * Paket 3.2 (§12): pure plan of the AD computer sync. No I/O — the service
 * loads the inputs, this decides, the service writes. Rules:
 *
 * - match by `externalId = objectGUID`; a computer not yet known may adopt an
 *   existing manual/imported asset with the same hostname (unique match only);
 * - DIRECTORY assets follow AD (name, OS, hostname, OU); adopted assets keep
 *   their data and only get `lastSeenAt`, the directory marker and empty
 *   attributes filled;
 * - a user link is only *suggested*; a manual assignment always wins and a
 *   disagreement is reported, never overwritten;
 * - a computer that disappears is flagged `missingFromDirectoryAt`, never
 *   retired or deleted; a guard stops mass flagging after a bad read.
 */

export type UserMatchStrategy = 'managedBy' | 'namePattern' | 'description';

export type DirectoryAssetState = {
  readonly id: string;
  readonly externalId: string | null;
  readonly source: 'MANUAL' | 'IMPORT' | 'DIRECTORY';
  readonly typeId: string;
  readonly name: string;
  readonly status: string;
  readonly organizationalUnitId: string;
  readonly assignedUserId: string | null;
  readonly assignmentSuggested: boolean;
  readonly lastSeenAt: Date | null;
  readonly missingFromDirectoryAt: Date | null;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly version: number;
};

export type DirectoryUserCandidate = {
  readonly id: string;
  readonly email: string;
  readonly distinguishedName: string | null;
  readonly isActive: boolean;
};

export type DirectoryUnitCandidate = {
  readonly id: string;
  readonly ouPath: string;
  readonly distinguishedName: string;
};

export type DirectoryTypeTarget = {
  readonly id: string;
  readonly key: string;
  /** Active attribute keys of the type (only these are written). */
  readonly attributeKeys: ReadonlySet<string>;
};

export type DirectoryPlanInput = {
  readonly computers: readonly LdapsDirectoryComputerEntry[];
  /** Assets with an externalId (any source). */
  readonly linked: readonly DirectoryAssetState[];
  /** Assets without externalId whose hostname attribute is set, keyed by lower-case hostname. */
  readonly adoptable: ReadonlyMap<string, readonly DirectoryAssetState[]>;
  readonly users: readonly DirectoryUserCandidate[];
  readonly units: readonly DirectoryUnitCandidate[];
  readonly overrides: readonly OrganizationalUnitMappingOverride[];
  readonly computerType: DirectoryTypeTarget | null;
  readonly serverType: DirectoryTypeTarget | null;
  readonly userMatch: readonly UserMatchStrategy[];
  readonly namePattern: string;
  readonly defaultUnitId: string | null;
  /** Largest share of linked assets that may be flagged missing in one run (0-100). */
  readonly maxMissingPercent: number;
  readonly now: Date;
};

export type DirectoryCreate = {
  readonly externalId: string;
  readonly typeId: string;
  readonly name: string;
  readonly organizationalUnitId: string;
  readonly assignedUserId: string | null;
  readonly status: 'IN_USE' | 'IN_STOCK';
  readonly lastSeenAt: Date | null;
  readonly attributes: Record<string, unknown>;
  readonly userMatchedBy: UserMatchStrategy | null;
};

export type DirectoryUpdate = {
  readonly assetId: string;
  readonly version: number;
  readonly kind: 'update' | 'adopt' | 'restore' | 'missing';
  readonly data: {
    externalId?: string;
    name?: string;
    organizationalUnitId?: string;
    assignedUserId?: string | null;
    assignmentSuggested?: boolean;
    status?: string;
    lastSeenAt?: Date | null;
    missingFromDirectoryAt?: Date | null;
    attributes?: Record<string, unknown>;
  };
  /** Field names that changed, for history (lastSeenAt alone is not a change). */
  readonly changes: readonly string[];
  readonly userMatchedBy: UserMatchStrategy | null;
};

export type DirectoryConflict = {
  readonly assetId: string;
  readonly name: string;
  readonly assignedUserId: string;
  readonly suggestedUserId: string;
  readonly matchedBy: UserMatchStrategy;
};

export type DirectorySkip = {
  readonly externalId: string;
  readonly name: string;
  readonly reason: 'no_unit' | 'no_type' | 'hostname_ambiguous';
};

export type DirectoryPlanTotals = {
  readonly seen: number;
  readonly create: number;
  readonly update: number;
  readonly adopt: number;
  readonly restore: number;
  readonly missing: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly suggestions: number;
};

export type DirectoryPlan = {
  readonly creates: readonly DirectoryCreate[];
  readonly updates: readonly DirectoryUpdate[];
  readonly conflicts: readonly DirectoryConflict[];
  readonly skipped: readonly DirectorySkip[];
  readonly totals: DirectoryPlanTotals;
  /** True when the missing guard held back the flags (see `maxMissingPercent`). */
  readonly missingGuardTripped: boolean;
  readonly wouldFlagMissing: number;
};

const assignableStatuses = new Set(['ORDERED', 'IN_STOCK']);
const frozenStatuses = new Set(['LOST', 'RETIRED', 'DISPOSED']);

export function planDirectoryComputers(input: DirectoryPlanInput): DirectoryPlan {
  const creates: DirectoryCreate[] = [];
  const updates: DirectoryUpdate[] = [];
  const conflicts: DirectoryConflict[] = [];
  const skipped: DirectorySkip[] = [];
  let unchanged = 0;
  let suggestions = 0;

  const byExternalId = new Map(input.linked.filter((asset) => asset.externalId !== null).map((asset) => [asset.externalId as string, asset]));
  const resolveUser = createUserResolver(input);
  const resolveUnit = createUnitResolver(input);
  const seen = new Set<string>();
  const adopted = new Set<string>();

  for (const computer of dedupe(input.computers)) {
    seen.add(computer.guid);
    const isServer = /server/i.test(computer.operatingSystem ?? '');
    const type = isServer ? (input.serverType ?? input.computerType) : input.computerType;
    const suggestion = resolveUser(computer);
    const hostname = (computer.dnsHostName ?? computer.name).trim();
    const os = [computer.operatingSystem, computer.operatingSystemVersion].filter(Boolean).join(' ').trim() || null;

    let existing = byExternalId.get(computer.guid) ?? null;
    let adopting = false;
    if (existing === null) {
      const candidates = [computer.name, computer.dnsHostName, computer.dnsHostName?.split('.')[0]]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
      const matches = [...new Map(candidates.flatMap((key) => input.adoptable.get(key) ?? []).map((asset) => [asset.id, asset])).values()].filter(
        (asset) => !adopted.has(asset.id),
      );
      if (matches.length > 1) {
        skipped.push({ externalId: computer.guid, name: computer.name, reason: 'hostname_ambiguous' });
        continue;
      }
      if (matches.length === 1) {
        existing = matches[0];
        adopting = true;
        adopted.add(existing.id);
      }
    }

    if (existing === null) {
      if (type === null) {
        skipped.push({ externalId: computer.guid, name: computer.name, reason: 'no_type' });
        continue;
      }
      const unitId = resolveUnit(computer.distinguishedName);
      if (unitId === null) {
        skipped.push({ externalId: computer.guid, name: computer.name, reason: 'no_unit' });
        continue;
      }
      const attributes: Record<string, unknown> = {};
      if (type.attributeKeys.has('hostname')) attributes.hostname = hostname;
      if (os !== null && type.attributeKeys.has('os')) attributes.os = os;
      if (suggestion !== null) suggestions += 1;
      creates.push({
        externalId: computer.guid,
        typeId: type.id,
        name: computer.name.slice(0, 200),
        organizationalUnitId: unitId,
        assignedUserId: suggestion?.userId ?? null,
        status: suggestion === null ? 'IN_STOCK' : 'IN_USE',
        lastSeenAt: computer.lastLogonAt,
        attributes,
        userMatchedBy: suggestion?.matchedBy ?? null,
      });
      continue;
    }

    const data: DirectoryUpdate['data'] = {};
    const changes: string[] = [];
    const ownedByDirectory = existing.source === 'DIRECTORY';
    const nextAttributes: Record<string, unknown> = { ...existing.attributes };
    let attributesChanged = false;
    const setAttribute = (key: string, value: string | null) => {
      if (value === null || !(typeAttributeKeys(input, existing!.typeId)?.has(key) ?? false)) return;
      const current = nextAttributes[key];
      const empty = current === undefined || current === null || current === '';
      if ((ownedByDirectory || empty) && current !== value) {
        nextAttributes[key] = value;
        attributesChanged = true;
      }
    };
    setAttribute('hostname', hostname);
    setAttribute('os', os);
    if (attributesChanged) {
      data.attributes = nextAttributes;
      changes.push('attributes');
    }
    if (adopting) {
      data.externalId = computer.guid;
      changes.push('externalId');
    }
    if (ownedByDirectory && existing.name !== computer.name.slice(0, 200)) {
      data.name = computer.name.slice(0, 200);
      changes.push('name');
    }
    if (ownedByDirectory) {
      const unitId = resolveUnit(computer.distinguishedName);
      if (unitId !== null && unitId !== existing.organizationalUnitId) {
        data.organizationalUnitId = unitId;
        changes.push('organizationalUnitId');
      }
    }
    if (existing.missingFromDirectoryAt !== null) {
      data.missingFromDirectoryAt = null;
      changes.push('missingFromDirectoryAt');
    }
    const lastSeenChanged = (existing.lastSeenAt?.getTime() ?? null) !== (computer.lastLogonAt?.getTime() ?? null);
    if (lastSeenChanged) data.lastSeenAt = computer.lastLogonAt;

    let matchedBy: UserMatchStrategy | null = null;
    if (suggestion !== null && !frozenStatuses.has(existing.status) && suggestion.userId !== existing.assignedUserId) {
      if (existing.assignedUserId !== null && !existing.assignmentSuggested) {
        conflicts.push({
          assetId: existing.id,
          name: existing.name,
          assignedUserId: existing.assignedUserId,
          suggestedUserId: suggestion.userId,
          matchedBy: suggestion.matchedBy,
        });
      } else if (existing.assignedUserId !== null || assignableStatuses.has(existing.status) || existing.status === 'IN_USE') {
        data.assignedUserId = suggestion.userId;
        data.assignmentSuggested = true;
        if (existing.status !== 'IN_USE') data.status = 'IN_USE';
        changes.push('assignedUserId');
        matchedBy = suggestion.matchedBy;
        suggestions += 1;
      }
    }

    if (changes.length === 0 && !lastSeenChanged) {
      unchanged += 1;
      continue;
    }
    updates.push({
      assetId: existing.id,
      version: existing.version,
      kind: adopting ? 'adopt' : existing.missingFromDirectoryAt !== null ? 'restore' : 'update',
      data,
      changes,
      userMatchedBy: matchedBy,
    });
  }

  // Missing: linked assets not returned by this read.
  const missing = input.linked.filter((asset) => asset.externalId !== null && !seen.has(asset.externalId) && asset.missingFromDirectoryAt === null);
  const linkedCount = input.linked.filter((asset) => asset.externalId !== null && asset.missingFromDirectoryAt === null).length;
  const limit = Math.floor((linkedCount * Math.max(0, Math.min(100, input.maxMissingPercent))) / 100);
  const missingGuardTripped = missing.length > 0 && (input.computers.length === 0 || (missing.length > limit && missing.length > 5));
  if (!missingGuardTripped) {
    for (const asset of missing) {
      updates.push({
        assetId: asset.id,
        version: asset.version,
        kind: 'missing',
        data: { missingFromDirectoryAt: input.now },
        changes: ['missingFromDirectoryAt'],
        userMatchedBy: null,
      });
    }
  }

  const count = (kind: DirectoryUpdate['kind']) => updates.filter((entry) => entry.kind === kind).length;
  return {
    creates,
    updates,
    conflicts,
    skipped,
    missingGuardTripped,
    wouldFlagMissing: missing.length,
    totals: {
      seen: seen.size,
      create: creates.length,
      update: count('update'),
      adopt: count('adopt'),
      restore: count('restore'),
      missing: count('missing'),
      unchanged,
      skipped: skipped.length,
      conflicts: conflicts.length,
      suggestions,
    },
  };

  function typeAttributeKeys(context: DirectoryPlanInput, typeId: string): ReadonlySet<string> | null {
    if (context.computerType?.id === typeId) return context.computerType.attributeKeys;
    if (context.serverType?.id === typeId) return context.serverType.attributeKeys;
    return defaultAttributeKeys;
  }
}

/** Adopted assets of other types (e.g. laptops) get hostname/OS if empty. */
const defaultAttributeKeys: ReadonlySet<string> = new Set(['hostname', 'os']);

function dedupe(computers: readonly LdapsDirectoryComputerEntry[]): LdapsDirectoryComputerEntry[] {
  return [...new Map(computers.map((computer) => [computer.guid, computer])).values()];
}

type UserSuggestion = { readonly userId: string; readonly matchedBy: UserMatchStrategy };

export function createUserResolver(input: Pick<DirectoryPlanInput, 'users' | 'userMatch' | 'namePattern'>) {
  const active = input.users.filter((user) => user.isActive);
  const byDn = new Map<string, string>();
  for (const user of active) {
    if (user.distinguishedName) byDn.set(normalizeDistinguishedNameForComparison(user.distinguishedName), user.id);
  }
  const byEmail = new Map(active.map((user) => [user.email.toLowerCase(), user.id]));
  const byLogin = new Map<string, string | null>();
  for (const user of active) {
    const login = user.email.toLowerCase().split('@')[0];
    byLogin.set(login, byLogin.has(login) ? null : user.id); // null = ambiguous
  }
  const pattern = compileNamePattern(input.namePattern);
  const findLogin = (value: string): string | null => {
    const lower = value.toLowerCase();
    return byEmail.get(lower) ?? byLogin.get(lower) ?? null;
  };

  return (computer: LdapsDirectoryComputerEntry): UserSuggestion | null => {
    for (const strategy of input.userMatch) {
      if (strategy === 'managedBy' && computer.managedBy) {
        const id = byDn.get(normalizeDistinguishedNameForComparison(computer.managedBy));
        if (id) return { userId: id, matchedBy: strategy };
      }
      if (strategy === 'namePattern' && pattern !== null) {
        const login = pattern.exec(computer.name)?.groups?.login;
        const id = login ? findLogin(login) : null;
        if (id) return { userId: id, matchedBy: strategy };
      }
      if (strategy === 'description' && computer.description) {
        const tokens = computer.description.split(/[\s,;()<>[\]"']+/).filter((token) => token.length >= 3);
        const ids = new Set(tokens.map(findLogin).filter((id): id is string => id !== null));
        if (ids.size === 1) return { userId: [...ids][0], matchedBy: strategy };
      }
    }
    return null;
  };
}

export function compileNamePattern(source: string): RegExp | null {
  if (source.trim() === '') return null;
  try {
    const pattern = new RegExp(source, 'i');
    return pattern.source.includes('(?<login>') ? pattern : null;
  } catch {
    return null;
  }
}

/**
 * OU for a computer: a `dnSuffix` override, then the nearest known ancestor
 * by DN, then by application OU path (computers often sit in a "Computers"
 * sub-OU that is not mirrored), then the configured default.
 */
export function createUnitResolver(input: Pick<DirectoryPlanInput, 'units' | 'overrides' | 'defaultUnitId'>) {
  const byPath = new Map(input.units.map((unit) => [unit.ouPath.toLowerCase(), unit.id]));
  const byDn = new Map(input.units.map((unit) => [normalizeDistinguishedNameForComparison(unit.distinguishedName), unit.id]));
  const defaultId = input.defaultUnitId && input.units.some((unit) => unit.id === input.defaultUnitId) ? input.defaultUnitId : null;
  return (distinguishedName: string): string | null => {
    for (const override of input.overrides) {
      if ('dnSuffix' in override && isDistinguishedNameWithin(distinguishedName, override.dnSuffix)) {
        const id = byPath.get(override.ouPath.toLowerCase());
        if (id) return id;
      }
    }
    for (let dn = parentDistinguishedName(distinguishedName); dn !== null; dn = parentDistinguishedName(dn)) {
      const id = byDn.get(normalizeDistinguishedNameForComparison(dn));
      if (id) return id;
    }
    let path = organizationalUnitPathFromDistinguishedName(distinguishedName);
    while (path !== null && path.length > 1) {
      const id = byPath.get(path.toLowerCase());
      if (id) return id;
      const cut = path.lastIndexOf('/');
      path = cut > 0 ? path.slice(0, cut) : null;
    }
    return defaultId;
  };
}
