import { Injectable, Logger, Optional } from '@nestjs/common';
import { CacheInvalidationService } from '../../common/cache-invalidation/cache-invalidation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import type { RoleHolderFence } from '../../common/principal-context/principal-context.types';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import { JwtSigningSecretLoader } from '../authentication/jwt-signing-secret.loader';
import { getRolePermissions } from './get-role-permissions';
import { listPermissionCatalog } from './list-permission-catalog';
import { listRoles } from './list-roles';
import { mapRbacError } from './map-rbac-error';
import { RbacError } from './rbac.error';
import { previewRolePermissionImpact } from './preview-role-permission-impact';
import type {
  PermissionCatalogEntry,
  ReplaceRolePermissionsInput,
  RolePermissionPreviewResponse,
  RoleSummaryResponse,
} from './rbac.types';
import {
  replaceRolePermissions,
  type RoleHoldersInvalidationScheduler,
} from './replace-role-permissions';
import { roleHoldersInvalidationNamespace } from './role-holders-invalidation';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly shadowAuthorizationService: ShadowAuthorizationService,
    // Phase 2.2: optional so the unit tests can build the service without Redis.
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
    // Paket 5.1 (M4 B2): the impact preview is signed with the session secret.
    @Optional()
    private readonly jwtSigningSecretLoader?: JwtSigningSecretLoader,
    // W2.32 (`BA-rbac-05`): the durable retry of the post-commit cache notice.
    // Optional so the unit tests can build the service without Redis/Postgres;
    // its absence costs a guaranteed cache miss, never a stale grant.
    @Optional()
    private readonly cacheInvalidation?: CacheInvalidationService,
  ) {}

  list(): Promise<readonly RoleSummaryResponse[]> {
    return this.execute(() => listRoles(this.prisma));
  }

  listPermissionCatalog(): Promise<readonly PermissionCatalogEntry[]> {
    return Promise.resolve(listPermissionCatalog());
  }

  getPermissions(roleKey: string): Promise<readonly string[]> {
    return this.execute(() => getRolePermissions(this.prisma, roleKey));
  }

  preview(
    roleKey: string,
    permissionKeys: readonly string[],
    actorUserId: string | null = null,
  ): Promise<RolePermissionPreviewResponse> {
    return this.execute(async () =>
      previewRolePermissionImpact({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        shadowAuthorizationService: this.shadowAuthorizationService,
        roleKey,
        permissionKeys,
        actorUserId,
        signingSecret: await this.loadPreviewSigningSecret(),
      }),
    );
  }

  replace(input: ReplaceRolePermissionsInput): Promise<readonly string[]> {
    return this.execute(async () =>
      replaceRolePermissions(
        this.prisma,
        input,
        (roleId, fencedHolders) =>
          this.publishRoleHolders(roleId, fencedHolders),
        await this.loadPreviewSigningSecret(),
        this.roleHoldersInvalidationScheduler(),
      ),
    );
  }

  /**
   * W2.32 (`BA-rbac-05`): the outbox intent is written inside the role write's
   * transaction, so the retry survives a crash between the commit and the Redis
   * call.
   */
  private roleHoldersInvalidationScheduler():
    | RoleHoldersInvalidationScheduler
    | undefined {
    if (this.cacheInvalidation === undefined) {
      return undefined;
    }
    return (transaction, scheduled) =>
      this.cacheInvalidation!.schedule(transaction, {
        namespace: roleHoldersInvalidationNamespace,
        key: scheduled.roleId,
        revision: scheduled.revision,
      });
  }

  /**
   * W2.32 (`BA-rbac-05`): the post-commit step only *publishes* the versions the
   * write already committed. A failure here is logged and retried through the
   * outbox — it must not turn a committed permission change into an error,
   * because the change is already in force for every reader that hits the
   * database fence.
   */
  private async publishRoleHolders(
    roleId: string,
    fencedHolders: readonly RoleHolderFence[],
  ): Promise<number> {
    if (this.principalContextInvalidator === undefined) {
      this.logger.warn(
        `authz_role_invalidation_unwired role=${roleId} users=${fencedHolders.length} fallback=durable_fence`,
      );
      return 0;
    }
    try {
      return await this.principalContextInvalidator.publishCommittedRoleHolders(
        roleId,
        fencedHolders,
      );
    } catch (error) {
      this.logger.warn(
        `authz_role_invalidation_deferred role=${roleId} users=${fencedHolders.length} retry=outbox reason=${describeInvalidationError(error)}`,
      );
      return 0;
    }
  }

  /**
   * Paket 5.1 (M4 B2): without the secret the wizard cannot sign or verify a
   * preview, so the write stays closed (fail closed) instead of skipping the gate.
   */
  private async loadPreviewSigningSecret(): Promise<string> {
    if (this.jwtSigningSecretLoader === undefined) {
      throw new RbacError('PREVIEW_REQUIRED');
    }
    return this.jwtSigningSecretLoader.load();
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      mapRbacError(error);
    }
  }
}

function describeInvalidationError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
