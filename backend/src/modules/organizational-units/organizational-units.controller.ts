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
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { AssignUserOrganizationalUnitDto } from './dto/assign-user-organizational-unit.dto';
import { CreateOrganizationalUnitDto } from './dto/create-organizational-unit.dto';
import { UpdateOrganizationalUnitDto } from './dto/update-organizational-unit.dto';
import { organizationalUnitTreeReadRoles } from './organizational-unit-tree-read-roles';
import { OrganizationalUnitsService } from './organizational-units.service';
import type {
  OrganizationalUnitDetailResponse,
  OrganizationalUnitTreeNodeResponse,
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
  create(
    @Body() body: CreateOrganizationalUnitDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.create(body, readAuditContext(request));
  }

  @Get('tree')
  @RequireRoles(...organizationalUnitTreeReadRoles)
  getTree(): Promise<readonly OrganizationalUnitTreeNodeResponse[]> {
    return this.organizationalUnitsService.getTree();
  }

  @Put('user-mappings')
  assignUser(
    @Body() body: AssignUserOrganizationalUnitDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<OrganizationalUnitUserResponse> {
    return this.organizationalUnitsService.assignUser(body, readAuditContext(request));
  }

  @Get(':organizationalUnitId/users')
  listUsers(
    @Param('organizationalUnitId') organizationalUnitId: string,
  ): Promise<readonly OrganizationalUnitUserResponse[]> {
    return this.organizationalUnitsService.listUsers(organizationalUnitId);
  }

  @Get(':organizationalUnitId')
  getById(
    @Param('organizationalUnitId') organizationalUnitId: string,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.organizationalUnitsService.getById(organizationalUnitId);
  }

  @Patch(':organizationalUnitId')
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
