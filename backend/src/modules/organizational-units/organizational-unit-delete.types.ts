export type OrganizationalUnitDeleteBlockerKind =
  | 'children'
  | 'mappedUsers'
  | 'groups'
  | 'assets'
  | 'assetContracts'
  | 'softwareLicenses'
  | 'assetSignatories'
  | 'changeRequests'
  | 'knowledgeArticles'
  | 'knowledgeInterceptResolutions'
  | 'problems'
  | 'routingRules'
  | 'slaRules'
  | 'reportSchedules'
  | 'tickets'
  | 'directoryChildren'
  | 'directoryUsers'
  | 'directoryGroups';

export type OrganizationalUnitDeleteBlocker = {
  readonly kind: OrganizationalUnitDeleteBlockerKind;
  readonly count: number;
};

export type OrganizationalUnitDeleteWarning = {
  readonly code: 'ROLE_ASSIGNMENTS_REMOVED';
  readonly count: number;
};

export type OrganizationalUnitDeleteResponse = {
  readonly warnings: readonly OrganizationalUnitDeleteWarning[];
};

export type OrganizationalUnitDeleteOutcome = OrganizationalUnitDeleteResponse & {
  /** Internal invalidation targets; never returned from an HTTP response. */
  readonly affectedUserIds: readonly string[];
};

export type OrganizationalUnitAuditContext = {
  readonly actorUserId: string | null;
  readonly requestId: string | null;
};
