import { doesOrganizationalUnitScopeCover } from '../../authorization/does-organizational-unit-scope-cover';

/**
 * W7.93 (`BA-reports-03`): what a schedule's `serviceId`/`groupId` filters are allowed to point at.
 *
 * A schedule is anchored to one organizational unit and its subtree. A group carries its own unit, so a
 * group from a parent or a sibling branch is a *foreign reference*: the filter silently yields an empty
 * slice, the schedule view and the scope line of the e-mail name a resource outside the unit, and the
 * recipient learns that the resource exists. A service has no unit of its own — the catalog is global — so
 * the check for a service is not "does it belong to this subtree" but "may this actor use it at all",
 * which is the authorization layer's job (`reportScheduleServiceScopeRequirements`).
 */
export const reportScheduleScopeFields = ['serviceId', 'groupId'] as const;

export type ReportScheduleScopeField = (typeof reportScheduleScopeFields)[number];

/**
 * The group's unit must be the schedule's unit or one of its descendants. Blank or missing paths never
 * grant anything: a subtree that cannot be read is not a subtree the reference belongs to.
 */
export function isGroupWithinUnitSubtree(input: {
  readonly scopeUnitPath: string | null | undefined;
  readonly groupUnitPath: string | null | undefined;
}): boolean {
  return doesOrganizationalUnitScopeCover({
    assignedPath: input.scopeUnitPath ?? null,
    requestedPath: input.groupUnitPath ?? null,
  });
}

/**
 * One decision for a stored reference, used by both the write path (refuse to store) and the read/delivery
 * path (a schedule saved before this package may already hold a foreign reference — it must not keep
 * printing a name outside the unit).
 */
export function describeReportScheduleScopeProblem(input: {
  readonly group: { readonly ouPath: string | null } | null | undefined;
  readonly scopeUnitPath: string | null | undefined;
}): ReportScheduleScopeField | null {
  if (input.group === null || input.group === undefined) return null;
  return isGroupWithinUnitSubtree({
    scopeUnitPath: input.scopeUnitPath,
    groupUnitPath: input.group.ouPath,
  })
    ? null
    : 'groupId';
}
