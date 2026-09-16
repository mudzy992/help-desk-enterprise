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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { ListGroupsQueryDto } from './dto/list-groups-query.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';
import type { GroupListItemResponse, GroupResponse } from './groups.types';

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
  list(
    @Query() query: ListGroupsQueryDto,
  ): Promise<readonly GroupListItemResponse[]> {
    return this.groupsService.list(query);
  }

  @Post()
  @RequirePermissions(permissionKeys.groupManage)
  create(@Body() body: CreateGroupDto): Promise<GroupResponse> {
    return this.groupsService.create(body);
  }

  @Get(':groupId')
  getById(@Param('groupId') groupId: string): Promise<GroupResponse> {
    return this.groupsService.getById(groupId);
  }

  @Patch(':groupId')
  @RequirePermissions(permissionKeys.groupManage)
  update(
    @Param('groupId') groupId: string,
    @Body() body: UpdateGroupDto,
  ): Promise<GroupResponse> {
    return this.groupsService.update(groupId, body);
  }

  @Delete(':groupId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.groupManage)
  async delete(@Param('groupId') groupId: string): Promise<void> {
    await this.groupsService.delete(groupId);
  }

  @Post(':groupId/members/:userId')
  @RequirePermissions(permissionKeys.groupManage)
  addMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ): Promise<GroupResponse> {
    return this.groupsService.addMember(groupId, userId);
  }

  @Delete(':groupId/members/:userId')
  @RequirePermissions(permissionKeys.groupManage)
  removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ): Promise<GroupResponse> {
    return this.groupsService.removeMember(groupId, userId);
  }
}
