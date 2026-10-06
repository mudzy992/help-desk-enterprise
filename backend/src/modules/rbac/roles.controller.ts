import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { readRequestIdHeader } from '../../common/request-context/read-request-id-header';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import {
  PreviewRolePermissionsDto,
  ReplaceRolePermissionsDto,
} from './dto/replace-role-permissions.dto';
import type {
  PermissionCatalogEntry,
  RolePermissionPreviewResponse,
  RoleSummaryResponse,
} from './rbac.types';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list(): Promise<readonly RoleSummaryResponse[]> {
    return this.rolesService.list();
  }

  @Get('permissions/catalog')
  listPermissionCatalog(): Promise<readonly PermissionCatalogEntry[]> {
    return this.rolesService.listPermissionCatalog();
  }

  @Get(':roleKey/permissions')
  getPermissions(
    @Param('roleKey') roleKey: string,
  ): Promise<readonly string[]> {
    return this.rolesService.getPermissions(roleKey);
  }

  @Post(':roleKey/permissions/preview')
  preview(
    @Param('roleKey') roleKey: string,
    @Body() body: PreviewRolePermissionsDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<RolePermissionPreviewResponse> {
    // Paket 5.1 (M4 B2): the returned token is bound to this actor, so the
    // confirmation can only be sent by whoever ran the preview.
    const principal = readAuthenticatedPrincipal(request);
    return this.rolesService.preview(
      roleKey,
      body.permissionKeys,
      principal?.subjectId ?? null,
    );
  }

  @Put(':roleKey/permissions')
  replace(
    @Param('roleKey') roleKey: string,
    @Body() body: ReplaceRolePermissionsDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly string[]> {
    const principal = readAuthenticatedPrincipal(request);
    return this.rolesService.replace({
      roleKey,
      permissionKeys: body.permissionKeys,
      previewToken: body.previewToken,
      reason: body.reason,
      actorUserId: principal?.subjectId ?? null,
      requestId: readRequestIdHeader(request.headers),
    });
  }
}
