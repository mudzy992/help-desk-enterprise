/**
 * Paket 1.8 (A4): the change list of a full directory sync. JSON-serializable
 * (stored on the dry-run row and applied later). Contains directory attributes
 * only — never passwords or tokens.
 */
export type PlannedUnitCreate = {
  readonly distinguishedName: string;
  readonly path: string;
  readonly name: string;
  readonly type: string;
  readonly parentPath: string | null;
};

export type PlannedUnitUpdate = PlannedUnitCreate & {
  readonly id: string;
  readonly changes: readonly string[];
};

export type PlannedUserFields = {
  readonly guid: string;
  readonly email: string;
  readonly displayName: string;
  readonly distinguishedName: string;
  readonly company: string | null;
  readonly department: string | null;
  /** null = keep the current unit (update) / no unit (create). */
  readonly ouPath: string | null;
};

export type PlannedUserUpdate = PlannedUserFields & {
  readonly userId: string;
  readonly changes: readonly string[];
};

export type PlannedUserDeactivation = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly reason: 'missing' | 'disabled';
};

export type PlannedRoleGrant = {
  /** Existing user id, or null when the user is created by this plan. */
  readonly userId: string | null;
  readonly email: string;
  readonly roleKey: 'ADMIN' | 'AGENT';
  readonly ouPath: string;
};

export type PlannedRoleRevoke = {
  readonly userRoleId: string;
  readonly userId: string;
  readonly email: string;
  readonly roleKey: string;
};

export type DirectorySyncExceptionCode =
  | 'GUID_MISSING'
  | 'NO_EMAIL'
  | 'DUPLICATE_EMAIL'
  | 'EMAIL_TAKEN_BY_LOCAL'
  | 'EMAIL_CONFLICT'
  | 'NO_OU_MATCH'
  | 'ROLE_WITHOUT_OU'
  | 'KEPT_INACTIVE_BY_ADMIN'
  | 'OU_NOT_IN_DIRECTORY';

export type DirectorySyncException = {
  readonly code: DirectorySyncExceptionCode;
  readonly distinguishedName: string | null;
  readonly email: string | null;
  readonly detail: string | null;
};

export type DirectorySyncSafeguard = {
  readonly activeManagedUsers: number;
  readonly deactivations: number;
  readonly percent: number;
  readonly limitPercent: number;
  readonly tripped: boolean;
};

export type DirectorySyncPlan = {
  readonly organizationalUnits: {
    readonly create: readonly PlannedUnitCreate[];
    readonly update: readonly PlannedUnitUpdate[];
  };
  readonly users: {
    readonly create: readonly PlannedUserFields[];
    readonly update: readonly PlannedUserUpdate[];
    readonly reactivate: readonly PlannedUserUpdate[];
    readonly deactivate: readonly PlannedUserDeactivation[];
    readonly unchanged: number;
  };
  readonly roles: {
    readonly grant: readonly PlannedRoleGrant[];
    readonly revoke: readonly PlannedRoleRevoke[];
  };
  readonly exceptions: readonly DirectorySyncException[];
  readonly unitCounts: readonly { readonly path: string; readonly users: number }[];
  readonly safeguard: DirectorySyncSafeguard;
  readonly totals: {
    readonly directoryUsers: number;
    readonly directoryUnits: number;
  };
};

export type DirectorySyncPlanSummary = {
  readonly unitsCreated: number;
  readonly unitsUpdated: number;
  readonly usersCreated: number;
  readonly usersUpdated: number;
  readonly usersReactivated: number;
  readonly usersDeactivated: number;
  readonly usersUnchanged: number;
  readonly rolesGranted: number;
  readonly rolesRevoked: number;
  readonly exceptions: number;
  readonly directoryUsers: number;
  readonly directoryUnits: number;
  readonly safeguard: DirectorySyncSafeguard;
};

export function summarizeDirectorySyncPlan(plan: DirectorySyncPlan): DirectorySyncPlanSummary {
  return {
    unitsCreated: plan.organizationalUnits.create.length,
    unitsUpdated: plan.organizationalUnits.update.length,
    usersCreated: plan.users.create.length,
    usersUpdated: plan.users.update.length,
    usersReactivated: plan.users.reactivate.length,
    usersDeactivated: plan.users.deactivate.length,
    usersUnchanged: plan.users.unchanged,
    rolesGranted: plan.roles.grant.length,
    rolesRevoked: plan.roles.revoke.length,
    exceptions: plan.exceptions.length,
    directoryUsers: plan.totals.directoryUsers,
    directoryUnits: plan.totals.directoryUnits,
    safeguard: plan.safeguard,
  };
}
