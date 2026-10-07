import { authorizationDecisionReasons } from './authorization-decision-reason';
import type { AuthorizationAccessEvaluation } from './evaluate-authorization-request';
import type { AuthorizationDecisionInput } from './authorization.types';

/** Minimal, explicit evaluation result for guards that are unit-tested with a mock service. */
export function createTestAuthorizationEvaluation(
  allowed: boolean,
): AuthorizationAccessEvaluation {
  const decisionInput: AuthorizationDecisionInput = {
    context: null,
    requiredRoles: [],
    requiredPermissions: [],
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    requireOrganizationalUnitScope: false,
    requireServiceScope: false,
  };
  return {
    allowed,
    reason: allowed
      ? authorizationDecisionReasons.assignmentAllowed
      : authorizationDecisionReasons.noMatchingAssignment,
    decisionInput,
  };
}
