import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
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
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import type { UserRoleResponse } from './users.types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
  ) {}

  @Get(':userId/roles')
  listRoles(@Param('userId') userId: string): Promise<readonly UserRoleResponse[]> {
    return this.usersService.listRoles(userId);
  }

  @Post(':userId/roles')
  async assignRole(
    @Param('userId') userId: string,
    @Body() body: AssignUserRoleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<UserRoleResponse> {
    const principal = readAuthenticatedPrincipal(request);
    return this.usersService.assignRole({
      userId,
      roleKey: body.roleKey,
      organizationalUnitId: body.organizationalUnitId ?? null,
      serviceId: body.serviceId ?? null,
      actorUserId: principal?.subjectId ?? null,
      actorIsSuperAdmin: await this.resolveActorIsSuperAdmin(request),
      requestId: readRequestId(request),
    });
  }

  @Delete(':userId/roles/:userRoleId')
  @HttpCode(204)
  async removeRole(
    @Param('userId') userId: string,
    @Param('userRoleId') userRoleId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    const principal = readAuthenticatedPrincipal(request);
    await this.usersService.removeRole({
      userId,
      userRoleId,
      actorUserId: principal?.subjectId ?? null,
      requestId: readRequestId(request),
    });
  }

  private async resolveActorIsSuperAdmin(
    request: AuthenticatedHttpRequest,
  ): Promise<boolean> {
    const principal = readAuthenticatedPrincipal(request);
    if (principal === null) {
      return false;
    }
    const context = await this.authorizationContextLoader.loadBySubjectId(
      principal.subjectId,
    );
    return context?.isSuperAdmin === true;
  }
}

function readRequestId(request: AuthenticatedHttpRequest): string | null {
  return readRequestIdHeader(request.headers);
}
