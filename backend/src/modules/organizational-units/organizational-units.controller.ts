import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { OuAccessGuard } from '../authorization/ou-access.guard';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { AssignUserOrganizationalUnitDto } from './dto/assign-user-organizational-unit.dto';
import { CreateOrganizationalUnitDto } from './dto/create-organizational-unit.dto';
import { UpdateOrganizationalUnitDto } from './dto/update-organizational-unit.dto';
import { organizationalUnitTreeReadRoles } from './organizational-unit-tree-read-roles';
import { OrganizationalUnitsService } from './organizational-units.service';
import type {
  OrganizationalUnitDetailResponse,
  OrganizationalUnitTreeResponseNode,
  OrganizationalUnitUserResponse,
} from './organizational-unit.types';
import type { OrganizationalUnitDeleteResponse } from './organizational-unit-delete.types';

@Controller('organizational-units')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class OrganizationalUnitsController {
  constructor(
    private readonly organizationalUnitsService: OrganizationalUnitsService,
  ) {}

  @Post()
  // W2.9 (`BA-organizational-units-01`): a unit may only be created under a
  // parent the actor actually manages; a root-level unit needs a global grant.
  @UseGuards(OuAccessGuard)
  @RequirePermissions(permissionKeys.organizationalUnitManage)
  @RequireOrganizationalUnitScope({ field: 'parentId' })
  create(
    @Body() body: CreateOrganizationalUnitDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.create(body, readAuditContext(request));
  }

  @Get('tree')
  @RequireRoles(...organizationalUnitTreeReadRoles)
  getTree(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly OrganizationalUnitTreeResponseNode[]> {
    // The route stays open to every role (filters need a tree), but the admin
    // control plane tree is narrowed to the scope the caller may act on — and
    // W2.36 (`BA-organizational-units-06`) narrows the *shape* for everyone else:
    // no DN, no path, no org metadata unless the caller may manage units.
    return this.organizationalUnitsService.getTree(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
    );
  }

  @Put('user-mappings')
  @UseGuards(OuAccessGuard)
  @RequirePermissions(permissionKeys.organizationalUnitManage)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  assignUser(
    @Body() body: AssignUserOrganizationalUnitDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<OrganizationalUnitUserResponse> {
    return this.organizationalUnitsService.assignUser(body, readAuditContext(request));
  }

  @Get(':organizationalUnitId/users')
  @UseGuards(OuAccessGuard)
  @RequirePermissions(permissionKeys.organizationalUnitManage)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  listUsers(
    @Param('organizationalUnitId') organizationalUnitId: string,
  ): Promise<readonly OrganizationalUnitUserResponse[]> {
    return this.organizationalUnitsService.listUsers(organizationalUnitId);
  }

  @Get(':organizationalUnitId')
  @UseGuards(OuAccessGuard)
  @RequirePermissions(permissionKeys.organizationalUnitManage)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  getById(
    @Param('organizationalUnitId') organizationalUnitId: string,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.getById(organizationalUnitId);
  }

  @Patch(':organizationalUnitId')
  @UseGuards(OuAccessGuard)
  @RequirePermissions(permissionKeys.organizationalUnitManage)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  update(
    @Param('organizationalUnitId') organizationalUnitId: string,
    @Body() body: UpdateOrganizationalUnitDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.update(
      organizationalUnitId,
      body,
      readAuditContext(request),
    );
  }

  @Delete(':organizationalUnitId')
  @UseGuards(OuAccessGuard)
  @RequirePermissions(permissionKeys.organizationalUnitManage)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  delete(
    @Param('organizationalUnitId') organizationalUnitId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<OrganizationalUnitDeleteResponse> {
    return this.organizationalUnitsService.delete(
      organizationalUnitId,
      readAuditContext(request),
    );
  }
}

function readAuditContext(request: AuthenticatedHttpRequest) {
  return {
    actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    requestId: readRequestIdHeader(request.headers),
  };
}
