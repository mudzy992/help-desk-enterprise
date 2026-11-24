import {
  BadRequestException,
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
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { readRequestIdHeader } from '../../common/request-context/read-request-id-header';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { OuAccessGuard } from '../authorization/ou-access.guard';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import type {
  CreateUserResponse,
  ResetUserPasswordResponse,
  UserRoleResponse,
  UserSummaryResponse,
} from './users.types';
import { UsersService } from './users.service';
import { userListDefaultTake, userListMaxTake } from './list-users-summary';
import { SessionRegistryService } from '../authentication/security/session-registry.service';
import { assertActorManagesUserDestination } from './assert-user-manage-scope';
import { assertCanManageTargetUser } from './assert-can-manage-target-user';

/**
 * W2.10 (`BA-users-01`): the control plane is gated by an explicit permission
 * instead of the ADMIN role name, and every route that names a user in the URL
 * resolves that user's organizational unit in `OuAccessGuard`. The list route is
 * the exception the audit called out: it has no id to scope, so the service
 * narrows it to the caller's units (`listSummaryPageForActor`).
 */
@Controller('users')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequirePermissions(permissionKeys.userManage)
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
    private readonly sessionRegistry: SessionRegistryService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  async listSummary(
    @Query('q') query: string | undefined,
    @Query('take') take: string | undefined,
    @Query('skip') skip: string | undefined,
    @Req() request: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<readonly UserSummaryResponse[]> {
    const toInt = (value?: string) => {
      const parsed = Number.parseInt(value ?? '', 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const requestedTake = toInt(take) ?? userListDefaultTake;
    const page = await this.usersService.listSummaryPageForActor(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
      {
        query: typeof query === 'string' ? query : undefined,
        take: Math.min(Math.max(1, requestedTake), userListMaxTake),
        skip: Math.max(0, toInt(skip) ?? 0),
      },
    );
    response.setHeader('X-Total-Count', String(page.total));
    return page.items;
  }

  @Post()
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  async create(
    @Body() body: CreateUserDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<CreateUserResponse> {
    const principal = readAuthenticatedPrincipal(request);
    return this.usersService.create({
      displayName: body.displayName,
      email: body.email,
      organizationalUnitId: body.organizationalUnitId ?? null,
      roleKey: body.roleKey,
      actorUserId: principal?.subjectId ?? null,
      actorIsSuperAdmin: await this.resolveActorIsSuperAdmin(request),
      requestId: readRequestId(request),
    });
  }

  @Post(':userId/reset-password')
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'userId', resource: 'user' })
  @RequirePermissions(permissionKeys.userSecurityManage)
  async resetTemporaryPassword(
    @Param('userId') userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ResetUserPasswordResponse> {
    await this.assertCanManageTarget(request, userId);
    const response = await this.usersService.resetTemporaryPassword(userId, readAuditContext(request));
    // Paket 2.1: a reset password ends every session of the account.
    await this.sessionRegistry.revokeAll({
      userId,
      reason: 'admin',
      actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    });
    return response;
  }

  @Patch(':userId')
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'userId', resource: 'user' })
  async update(
    @Param('userId') userId: string,
    @Body() body: UpdateUserDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<UserSummaryResponse> {
    await this.assertCanManageTarget(request, userId);
    // W2.10: the guard covers the unit the user is in today; the body carries
    // the unit the user is moved to, which no route decorator can see.
    if (body.organizationalUnitId !== undefined) {
      await assertActorManagesUserDestination({
        authorizationService: this.authorizationService,
        principal: readAuthenticatedPrincipal(request),
        destination: {
          organizationalUnitId: body.organizationalUnitId ?? null,
          serviceId: null,
        },
      });
    }
    if (
      body.isActive === false &&
      readAuthenticatedPrincipal(request)?.subjectId === userId
    ) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot deactivate your own account',
      });
    }
    return this.usersService.update(
      {
        userId,
        displayName: body.displayName,
        email: body.email,
        organizationalUnitId: body.organizationalUnitId,
        isActive: body.isActive,
      },
      readAuditContext(request),
    );
  }

  @Delete(':userId')
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'userId', resource: 'user' })
  @HttpCode(204)
  async delete(
    @Param('userId') userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    const principal = readAuthenticatedPrincipal(request);
    if (principal?.subjectId === userId) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot delete your own account',
      });
    }
    await this.assertCanManageTarget(request, userId);
    await this.usersService.delete(userId, readAuditContext(request));
  }

  @Get(':userId/roles')
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'userId', resource: 'user' })
  listRoles(@Param('userId') userId: string): Promise<readonly UserRoleResponse[]> {
    return this.usersService.listRoles(userId);
  }

  @Post(':userId/roles')
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'userId', resource: 'user' })
  async assignRole(
    @Param('userId') userId: string,
    @Body() body: AssignUserRoleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<UserRoleResponse> {
    await this.assertCanManageTarget(request, userId);
    const principal = readAuthenticatedPrincipal(request);
    // W2.10: the grant destination (unit or service) must be inside the actor's
    // own authority, otherwise a scoped ADMIN hands out scopes it does not hold.
    await assertActorManagesUserDestination({
      authorizationService: this.authorizationService,
      principal,
      destination: {
        organizationalUnitId: body.organizationalUnitId ?? null,
        serviceId: body.serviceId ?? null,
      },
    });
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
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'userId', resource: 'user' })
  @HttpCode(204)
  async removeRole(
    @Param('userId') userId: string,
    @Param('userRoleId') userRoleId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.assertCanManageTarget(request, userId);
    const principal = readAuthenticatedPrincipal(request);
    // W2.10: revoking a grant is a mutation of the *grant's* scope, not only of
    // the target user. A scoped ADMIN may not strip a unit or service grant it
    // does not control. An unknown assignment id is left to the service, which
    // answers 404 without revealing anything.
    const assignments = await this.usersService.listRoles(userId);
    const assignment = assignments.find((row) => row.id === userRoleId);
    if (assignment !== undefined) {
      await assertActorManagesUserDestination({
        authorizationService: this.authorizationService,
        principal,
        destination: {
          organizationalUnitId: assignment.organizationalUnitId,
          serviceId: assignment.serviceId,
        },
      });
    }
    await this.usersService.removeRole({
      userId,
      userRoleId,
      actorUserId: principal?.subjectId ?? null,
      requestId: readRequestId(request),
    });
  }

  private async assertCanManageTarget(
    request: AuthenticatedHttpRequest,
    targetUserId: string,
  ): Promise<void> {
    const target = await this.authorizationContextLoader.loadBySubjectId(
      targetUserId,
    );
    assertCanManageTargetUser({
      actorIsSuperAdmin: await this.resolveActorIsSuperAdmin(request),
      targetIsSuperAdmin: target?.isSuperAdmin === true,
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

function readAuditContext(request: AuthenticatedHttpRequest) {
  return {
    actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    requestId: readRequestId(request),
  };
}

function readRequestId(request: AuthenticatedHttpRequest): string | null {
  return readRequestIdHeader(request.headers);
}
