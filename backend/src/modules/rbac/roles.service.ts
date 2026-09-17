import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import { getRolePermissions } from './get-role-permissions';
import { listPermissionCatalog } from './list-permission-catalog';
import { listRoles } from './list-roles';
import { mapRbacError } from './map-rbac-error';
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
  ): Promise<RolePermissionPreviewResponse> {
    return this.execute(() =>
      previewRolePermissionImpact({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        shadowAuthorizationService: this.shadowAuthorizationService,
        roleKey,
        permissionKeys,
      }),
    );
  }

  replace(input: ReplaceRolePermissionsInput): Promise<readonly string[]> {
    return this.execute(() => replaceRolePermissions(this.prisma, input));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      mapRbacError(error);
    }
  }
}
