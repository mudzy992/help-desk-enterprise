import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import type { DefaultApproverRole } from './approvals.types';

export const defaultApproverRoles = [
  authorizationRoleKeys.admin,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.superAdmin,
] as const satisfies readonly DefaultApproverRole[];

export const defaultTicketApprovalsConfiguration = {
  enabled: true,
  requiredByService: {},
  defaultApproverRole: authorizationRoleKeys.admin,
  allowRequesterManager: false,
} as const;

export const ticketApprovalChangeLogReasons = {
  requested: 'ticket_approval_requested',
  approved: 'ticket_approval_approved',
  rejected: 'ticket_approval_rejected',
} as const;

export const ticketApprovalConstants = {
  maximumCommentLength: 2000,
  firstStepOrder: 1,
} as const;

export function approverRoleKeys(
  role: DefaultApproverRole,
): readonly string[] {
  if (role === authorizationRoleKeys.superAdmin) {
    return [];
  }
  if (role === authorizationRoleKeys.agent) {
    return [authorizationRoleKeys.agent, authorizationRoleKeys.admin];
  }
  return [authorizationRoleKeys.admin];
}
