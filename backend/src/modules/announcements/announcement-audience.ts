import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';

export type AnnouncementAudience = {
  readonly roles: readonly string[];
  readonly organizationalUnitIds: readonly string[];
  readonly groupIds: readonly string[];
};

export type AudienceMember = {
  readonly roleKeys: readonly string[];
  readonly groupIds: readonly string[];
  /** ouPath of the member's home unit; null = none. */
  readonly unitPath: string | null;
};

export type AnnouncementEffectiveStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ENDED' | 'WITHDRAWN';

/**
 * §3.1: a member is in the audience when every non-empty filter matches.
 * Units include their sub-units (ouPath prefix). `unitPaths` are the paths of
 * `audience.organizationalUnitIds`; an id without a known path matches nobody.
 */
export function isInAnnouncementAudience(
  audience: AnnouncementAudience,
  member: AudienceMember,
  unitPaths: ReadonlyMap<string, string>,
): boolean {
  if (audience.roles.length > 0 && !member.roleKeys.some((role) => audience.roles.includes(role))) return false;
  if (audience.groupIds.length > 0 && !member.groupIds.some((groupId) => audience.groupIds.includes(groupId))) {
    return false;
  }
  if (audience.organizationalUnitIds.length > 0) {
    return audience.organizationalUnitIds.some((unitId) =>
      doesOrganizationalUnitScopeCover({ assignedPath: unitPaths.get(unitId) ?? null, requestedPath: member.unitPath }),
    );
  }
  return true;
}

/** Ids of every unit covered by the audience units (the units themselves and all sub-units). */
export function expandAudienceUnits(
  audienceUnitIds: readonly string[],
  units: readonly { readonly id: string; readonly ouPath: string }[],
): string[] {
  const paths = units.filter((unit) => audienceUnitIds.includes(unit.id)).map((unit) => unit.ouPath);
  return units
    .filter((unit) => paths.some((path) => doesOrganizationalUnitScopeCover({ assignedPath: path, requestedPath: unit.ouPath })))
    .map((unit) => unit.id);
}

/** SCHEDULED and ENDED are derived, so they can never be stale. */
export function effectiveAnnouncementStatus(
  row: { readonly status: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN'; readonly startsAt: Date; readonly endsAt: Date },
  now: Date,
): AnnouncementEffectiveStatus {
  if (row.status !== 'PUBLISHED') return row.status;
  if (now.getTime() < row.startsAt.getTime()) return 'SCHEDULED';
  if (now.getTime() >= row.endsAt.getTime()) return 'ENDED';
  return 'PUBLISHED';
}

/**
 * §3.3: an agent (with the setting on) manages only announcements whose
 * audience is limited to units inside the agent's own unit.
 */
export function isAudienceWithinUnit(
  audienceUnitIds: readonly string[],
  ownUnitPath: string | null,
  unitPaths: ReadonlyMap<string, string>,
): boolean {
  if (ownUnitPath === null || audienceUnitIds.length === 0) return false;
  return audienceUnitIds.every((unitId) =>
    doesOrganizationalUnitScopeCover({ assignedPath: ownUnitPath, requestedPath: unitPaths.get(unitId) ?? null }),
  );
}

/** CSV cell: quoted, inner quotes doubled, formula prefixes neutralised. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
