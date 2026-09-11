import type { AuthorizationContext } from '../../authorization/authorization.types';
import type { TicketConfidentialConfiguration } from './confidential.types';
import type {
  ConfidentialAccessDecision,
  ConfidentialAccessFacts,
} from './confidential.types';

export function evaluateConfidentialTicketAccess(input: {
  readonly isConfidential: boolean;
  readonly configuration: TicketConfidentialConfiguration;
  readonly facts: ConfidentialAccessFacts;
}): ConfidentialAccessDecision {
  if (!input.configuration.enabled || !input.isConfidential) {
    return { allowed: true, via: 'not_confidential' };
  }
  if (input.facts.isRequester) {
    return { allowed: true, via: 'requester' };
  }
  if (input.facts.isAssignee) {
    return { allowed: true, via: 'assignee' };
  }
  if (input.facts.isHandlerGroupMember) {
    return { allowed: true, via: 'handler_group' };
  }
  if (input.facts.isExplicitParticipant) {
    return { allowed: true, via: 'grant' };
  }
  if (input.facts.hasUserGrant || input.facts.hasGroupGrant) {
    return { allowed: true, via: 'grant' };
  }
  if (input.facts.hasAllowedViewerRole) {
    return { allowed: true, via: 'allowed_role' };
  }
  if (input.facts.hasAllowedViewerGroup) {
    return { allowed: true, via: 'allowed_group' };
  }
  if (input.facts.hasActiveBreakGlass) {
    return { allowed: true, via: 'break_glass' };
  }
  return {
    allowed: false,
    breakGlassAvailable: canOfferBreakGlass(input.configuration, input.facts),
  };
}

export function actorHasBreakGlassRole(
  context: AuthorizationContext,
  allowedRoles: readonly string[],
): boolean {
  if (
    context.isSuperAdmin &&
    allowedRoles.includes('SUPER_ADMIN')
  ) {
    return true;
  }
  return context.assignments.some((assignment) =>
    allowedRoles.includes(assignment.roleKey),
  );
}

function canOfferBreakGlass(
  configuration: TicketConfidentialConfiguration,
  facts: ConfidentialAccessFacts,
): boolean {
  return configuration.breakGlassEnabled && facts.canInvokeBreakGlass;
}
