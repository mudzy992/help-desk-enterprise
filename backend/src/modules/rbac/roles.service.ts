import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
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
import { replaceRolePermissions } from './replace-role-permissions';

@Injectable()
export class RolesService {
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
        (roleId) =>
          this.principalContextInvalidator?.invalidateRoleHolders(roleId) ??
          Promise.resolve(0),
        await this.loadPreviewSigningSecret(),
      ),
    );
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
