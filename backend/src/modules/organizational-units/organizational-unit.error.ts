import type { OrganizationalUnitDeleteBlocker, OrganizationalUnitDeleteBlockerKind } from './organizational-unit-delete.types';

export type OrganizationalUnitErrorCode =
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'INVALID_NAME'
  | 'INVALID_DISTINGUISHED_NAME'
  | 'DISTINGUISHED_NAME_PARENT_MISMATCH'
  | 'INVALID_PARENT'
  | 'SELF_PARENT'
  | 'CIRCULAR_HIERARCHY'
  | 'DUPLICATE_DISTINGUISHED_NAME'
  | 'DUPLICATE_OU_PATH'
  | 'HAS_CHILDREN'
  | 'HAS_MAPPED_USERS'
  | 'HAS_GROUPS'
  | 'HAS_ASSETS'
  | 'HAS_CHANGE_REQUESTS'
  | 'HAS_KNOWLEDGE_ARTICLES'
  | 'HAS_PROBLEMS'
  | 'HAS_ROUTING_RULES'
  | 'HAS_SLA_RULES'
  | 'HAS_REPORT_SCHEDULES'
  | 'HAS_TICKETS'
  | 'RESOURCE_IN_USE';

export function organizationalUnitDeleteErrorCode(
  kind: OrganizationalUnitDeleteBlockerKind,
): OrganizationalUnitErrorCode {
  switch (kind) {
    case 'children':
    case 'directoryChildren':
      return 'HAS_CHILDREN';
    case 'mappedUsers':
    case 'directoryUsers':
      return 'HAS_MAPPED_USERS';
    case 'groups':
    case 'directoryGroups':
      return 'HAS_GROUPS';
    case 'assets':
    case 'assetContracts':
    case 'softwareLicenses':
    case 'assetSignatories':
      return 'HAS_ASSETS';
    case 'changeRequests':
      return 'HAS_CHANGE_REQUESTS';
    case 'knowledgeArticles':
    case 'knowledgeInterceptResolutions':
      return 'HAS_KNOWLEDGE_ARTICLES';
    case 'problems':
      return 'HAS_PROBLEMS';
    case 'routingRules':
      return 'HAS_ROUTING_RULES';
    case 'slaRules':
      return 'HAS_SLA_RULES';
    case 'reportSchedules':
      return 'HAS_REPORT_SCHEDULES';
    case 'tickets':
      return 'HAS_TICKETS';
  }
}

export class OrganizationalUnitError extends Error {
  constructor(
    readonly code: OrganizationalUnitErrorCode,
    message = code,
    readonly blockers: readonly OrganizationalUnitDeleteBlocker[] = [],
  ) {
    super(message);
    this.name = 'OrganizationalUnitError';
  }
}
