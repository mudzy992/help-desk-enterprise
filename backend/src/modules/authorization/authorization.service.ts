import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { AuthorizationContextLoader } from './authorization-context.loader';
import {
  createAuthorizationLookups,
  evaluateAuthorizationRequest,
} from './evaluate-authorization-request';
import type { AuthorizationAccessEvaluation } from './evaluate-authorization-request';
import { evaluateResourcePolicy, type ResourcePolicyDecision } from './evaluate-resource-policy';
import { loadOrganizationalUnitPath, serviceExists } from './load-authorization-scope';
import type { AuthorizationRequirements } from './authorization.types';

export type AuthorizationServiceInput = {
  readonly principal: AuthorizationPrincipal | null;
  readonly requirements: AuthorizationRequirements;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
};

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly prisma: PrismaService,
  ) {}

  async authorize(input: AuthorizationServiceInput): Promise<boolean> {
    return (await this.authorizeWithDecision(input)).allowed;
  }

  /** Returns the reason as well as the decision for controlled audit boundaries. */
  async authorizeWithDecision(
    input: AuthorizationServiceInput,
  ): Promise<AuthorizationAccessEvaluation> {
    return evaluateAuthorizationRequest(
      input,
      createAuthorizationLookups(this.authorizationContextLoader, this.prisma),
    );
  }

  /**
   * Canonical permission + OU/service/ownership decision. Role keys are not an
   * input and therefore cannot become an accidental authorization shortcut.
   */
  async authorizeResource(input: {
    readonly principal: AuthorizationPrincipal | null;
    readonly permissionKey: string;
    readonly ownerUserId: string | null;
    readonly organizationalUnitId: string | null;
    readonly serviceId: string | null;
    readonly allowOwner: boolean;
  }): Promise<ResourcePolicyDecision> {
    if (input.principal === null || input.principal.subjectId.trim().length === 0) {
      return { allowed: false, reason: 'MISSING_CONTEXT' };
    }
    const [context, organizationalUnitPath, knownService] = await Promise.all([
      this.authorizationContextLoader.loadBySubjectId(input.principal.subjectId),
      input.organizationalUnitId === null
        ? Promise.resolve(null)
        : loadOrganizationalUnitPath(this.prisma, input.organizationalUnitId),
      input.serviceId === null ? Promise.resolve(true) : serviceExists(this.prisma, input.serviceId),
    ]);
    if (
      (input.organizationalUnitId !== null && organizationalUnitPath === null) ||
      !knownService
    ) return { allowed: false, reason: 'INVALID_INPUT' };
    return evaluateResourcePolicy({
      context,
      permissionKey: input.permissionKey,
      allowOwner: input.allowOwner,
      target: {
        ownerUserId: input.ownerUserId,
        organizationalUnitId: input.organizationalUnitId,
        organizationalUnitPath,
        serviceId: input.serviceId,
      },
    });
  }

  /** Resolves a group resource scope without returning any group data to the caller. */
  async resolveGroupOrganizationalUnitId(groupId: string | null): Promise<string | null> {
    if (groupId === null || groupId.trim().length === 0) return null;
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { organizationalUnitId: true },
    });
    return group?.organizationalUnitId ?? null;
  }

  /**
   * A SuperAdmin bypass is written to the tamper-evident audit chain before the
   * guarded handler runs. Callers fail closed if this transaction cannot commit.
   */
  async recordSuperAdminBypass(input: {
    readonly actorUserId: string;
    readonly requestId: string | null;
    readonly route: string;
    readonly method: string;
    readonly requiredRoles: readonly string[];
    readonly requiredPermissions: readonly string[];
    readonly permissionMatchMode: 'any' | 'all';
    readonly organizationalUnitId: string | null;
    readonly serviceId: string | null;
    readonly resourceType: string | null;
    readonly resourceId: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
        action: auditLogActions.authorizationSuperAdminBypass,
        entityType: auditLogEntityTypes.authorization,
        entityId: `${input.method} ${input.route}`,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        organizationalUnitId: input.organizationalUnitId,
        metadata: {
          decision: 'SUPER_ADMIN_ALLOWED',
          requiredRoles: [...input.requiredRoles],
          requiredPermissions: [...input.requiredPermissions],
          permissionMatchMode: input.permissionMatchMode,
          route: input.route,
          method: input.method,
          organizationalUnitId: input.organizationalUnitId,
          serviceId: input.serviceId,
          resource:
            input.resourceType !== null || input.resourceId !== null
              ? { type: input.resourceType, id: input.resourceId }
              : null,
        },
      });
    });
  }
}
