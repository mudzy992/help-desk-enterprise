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
