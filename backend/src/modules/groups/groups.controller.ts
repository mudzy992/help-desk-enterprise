import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
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
import { AuditPermissions } from '../authorization/audit-permissions.decorator';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { ListGroupsQueryDto } from './dto/list-groups-query.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';
import type { GroupListItemResponse, GroupResponse } from './groups.types';

@AdminConfigDomains('groups')
@Controller('groups')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @AuditPermissions(permissionKeys.groupManage)
  list(
    @Query() query: ListGroupsQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly GroupListItemResponse[]> {
    const principal = readAuthenticatedPrincipal(request);
    return this.groupsService.listAccessible(query, principal?.subjectId ?? '');
  }

  @Post()
  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  create(
    @Body() body: CreateGroupDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<GroupResponse> {
    return this.groupsService.create(body, readAuditContext(request));
  }

  @Get(':groupId')
  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'groupId', resource: 'group' })
  getById(@Param('groupId') groupId: string): Promise<GroupResponse> {
    return this.groupsService.getById(groupId);
  }

  @Patch(':groupId')
  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'groupId', resource: 'group' })
  update(
    @Param('groupId') groupId: string,
    @Body() body: UpdateGroupDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<GroupResponse> {
    return this.groupsService.update(groupId, body, readAuditContext(request));
  }

  @Delete(':groupId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'groupId', resource: 'group' })
  async delete(
    @Param('groupId') groupId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.groupsService.delete(groupId, readAuditContext(request));
  }

  @Post(':groupId/members/:userId')
  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'groupId', resource: 'group' })
  addMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<GroupResponse> {
    return this.groupsService.addMember(groupId, userId, readAuditContext(request));
  }

  @Delete(':groupId/members/:userId')
  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'groupId', resource: 'group' })
  removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<GroupResponse> {
    return this.groupsService.removeMember(groupId, userId, readAuditContext(request));
  }
}

function readAuditContext(request: AuthenticatedHttpRequest) {
  return {
    actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    requestId: readRequestIdHeader(request.headers),
  };
}
