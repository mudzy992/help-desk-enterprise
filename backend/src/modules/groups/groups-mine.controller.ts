import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { GroupsService } from './groups.service';
import type { MyGroupResponse } from './groups.types';
import { GroupsError } from './groups.error';
import { mapGroupsError } from './map-groups-error';

/**
 * Registered ahead of `GroupsController` (see `groups.module.ts`): that
 * controller's base path is `groups` with `@RequireRoles(admin)`, so without
 * a fixed registration order `GET /groups/mine` would either 404 under
 * `:groupId` or inherit the admin-only role.
 */
@Controller('groups/mine')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
export class GroupsMineController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly MyGroupResponse[]> {
    const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
    if (actorUserId.length === 0) {
      throw mapGroupsError(new GroupsError('FORBIDDEN'));
    }
    return this.groupsService.listMine(actorUserId);
  }
}
