import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { AuthorizationContextLoader } from './authorization-context.loader';
import {
  authorizationDecisionReasons,
  type AuthorizationDecisionReason,
} from './authorization-decision-reason';
import { decideAuthorizationAccess } from './evaluate-authorization-access';
import {
  loadOrganizationalUnitPath,
  serviceExists,
} from './load-authorization-scope';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  AuthorizationContext,
  AuthorizationDecisionInput,
  AuthorizationRequirements,
} from './authorization.types';

export type AuthorizationRequestInput = {
  readonly principal: AuthorizationPrincipal | null;
  readonly requirements: AuthorizationRequirements;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
};

export type AuthorizationLookups = {
  readonly loadBySubjectId: (
    subjectId: string,
  ) => Promise<AuthorizationContext | null>;
  readonly loadOrganizationalUnitPath: (
    organizationalUnitId: string | null,
  ) => Promise<string | null>;
  readonly serviceExists: (serviceId: string | null) => Promise<boolean>;
};

export type AuthorizationAccessEvaluation = {
  readonly allowed: boolean;
  readonly reason: AuthorizationDecisionReason;
  readonly decisionInput: AuthorizationDecisionInput;
};

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

function createDecisionInput(
  input: AuthorizationRequestInput,
  context: AuthorizationContext | null,
  organizationalUnitPath: string | null,
): AuthorizationDecisionInput {
  return {
    context,
    requiredRoles: input.requirements.requiredRoles,
    requiredPermissions: input.requirements.requiredPermissions,
    organizationalUnitId: input.organizationalUnitId,
    organizationalUnitPath,
    serviceId: input.serviceId,
    requireOrganizationalUnitScope:
      input.requirements.requireOrganizationalUnitScope,
    requireServiceScope: input.requirements.requireServiceScope,
  };
}

export function createAuthorizationLookups(
  authorizationContextLoader: AuthorizationContextLoader,
  prisma: PrismaService,
): AuthorizationLookups {
  return {
    loadBySubjectId: (subjectId) =>
      authorizationContextLoader.loadBySubjectId(subjectId),
    loadOrganizationalUnitPath: (organizationalUnitId) =>
      loadOrganizationalUnitPath(prisma, organizationalUnitId),
    serviceExists: (serviceId) => serviceExists(prisma, serviceId),
  };
}

export async function evaluateAuthorizationRequest(
  input: AuthorizationRequestInput,
  lookups: AuthorizationLookups,
): Promise<AuthorizationAccessEvaluation> {
  if (
    input.principal === null ||
    input.principal.subjectId.trim().length === 0
  ) {
    return {
      allowed: false,
      reason: authorizationDecisionReasons.missingPrincipal,
      decisionInput: createDecisionInput(input, null, null),
    };
  }
  const context = await lookups.loadBySubjectId(input.principal.subjectId);
  if (context === null) {
    return {
      allowed: false,
      reason: authorizationDecisionReasons.missingAuthorizationContext,
      decisionInput: createDecisionInput(input, null, null),
    };
  }
  let organizationalUnitPath: string | null = null;
  if (input.requirements.requireOrganizationalUnitScope) {
    organizationalUnitPath = await lookups.loadOrganizationalUnitPath(
      input.organizationalUnitId,
    );
    if (organizationalUnitPath === null) {
      return {
        allowed: false,
        reason: isBlank(input.organizationalUnitId)
          ? authorizationDecisionReasons.missingOrganizationalUnitScope
          : authorizationDecisionReasons.unknownOrganizationalUnit,
        decisionInput: createDecisionInput(input, context, null),
      };
    }
  }
  if (input.requirements.requireServiceScope) {
    const serviceIsKnown = await lookups.serviceExists(input.serviceId);
    if (!serviceIsKnown) {
      return {
        allowed: false,
        reason: isBlank(input.serviceId)
          ? authorizationDecisionReasons.missingServiceScope
          : authorizationDecisionReasons.unknownService,
        decisionInput: createDecisionInput(input, context, organizationalUnitPath),
      };
    }
  }
  const decisionInput = createDecisionInput(
    input,
    context,
    organizationalUnitPath,
  );
  const decision = decideAuthorizationAccess(decisionInput);
  return {
    allowed: decision.allowed,
    reason: decision.reason,
    decisionInput,
  };
}
