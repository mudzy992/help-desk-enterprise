export const authorizationDecisionReasons = {
  missingPrincipal: 'MISSING_PRINCIPAL',
  missingAuthorizationContext: 'MISSING_AUTHORIZATION_CONTEXT',
  invalidRequirementTokens: 'INVALID_REQUIREMENT_TOKENS',
  missingAuthorizationRequirement: 'MISSING_AUTHORIZATION_REQUIREMENT',
  missingOrganizationalUnitScope: 'MISSING_ORGANIZATIONAL_UNIT_SCOPE',
  unknownOrganizationalUnit: 'UNKNOWN_ORGANIZATIONAL_UNIT',
  missingServiceScope: 'MISSING_SERVICE_SCOPE',
  unknownService: 'UNKNOWN_SERVICE',
  superAdminNotLocalOnly: 'SUPER_ADMIN_NOT_LOCAL_ONLY',
  superAdminAllowed: 'SUPER_ADMIN_ALLOWED',
  assignmentAllowed: 'ASSIGNMENT_ALLOWED',
  noMatchingAssignment: 'NO_MATCHING_ASSIGNMENT',
} as const;

export type AuthorizationDecisionReason =
  (typeof authorizationDecisionReasons)[keyof typeof authorizationDecisionReasons];
