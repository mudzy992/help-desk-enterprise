import { authorizationRoleKeys } from '../../authorization/authorization.constants';

export const confidentialClassificationLevels = [
  'CONFIDENTIAL',
  'RESTRICTED',
] as const;

export const defaultBreakGlassAllowedRolesCsv = authorizationRoleKeys.superAdmin;

export const confidentialAuditActions = {
  viewed: 'ticket_confidential_viewed',
  denied: 'ticket_confidential_denied',
  breakGlass: 'ticket_confidential_break_glass',
} as const;

export const confidentialChangeLogReasons = {
  viewed: 'ticket_confidential_viewed',
  denied: 'ticket_confidential_denied',
  breakGlass: 'ticket_confidential_break_glass',
} as const;

export const breakGlassDurationMs = 60 * 60 * 1000;
export const maximumBreakGlassReasonLength = 512;

export const defaultTicketConfidentialConfiguration = {
  enabled: true,
  defaultForServiceIds: [] as readonly string[],
  allowedViewerRoles: [] as readonly string[],
  allowedViewerGroupIds: [] as readonly string[],
  breakGlassEnabled: true,
  breakGlassAllowedRoles: [authorizationRoleKeys.superAdmin] as readonly string[],
  breakGlassRequiresReason: true,
  auditViews: true,
} as const;
