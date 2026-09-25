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
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import type {
  CreateUserResponse,
  ResetUserPasswordResponse,
  UserRoleResponse,
  UserSummaryResponse,
} from './users.types';
import { UsersService } from './users.service';
import { assertCanManageTargetUser } from './assert-can-manage-target-user';

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

  @Get()
  listSummary(
    @Query('q') query?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ): Promise<readonly UserSummaryResponse[]> {
    const toInt = (value?: string) => {
      const parsed = Number.parseInt(value ?? '', 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    return this.usersService.listSummary({
      query: typeof query === 'string' ? query : undefined,
      take: toInt(take),
      skip: toInt(skip),
    });
  }

  @Post()
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
  async resetTemporaryPassword(
    @Param('userId') userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ResetUserPasswordResponse> {
    await this.assertCanManageTarget(request, userId);
    return this.usersService.resetTemporaryPassword(userId);
  }

  @Patch(':userId')
  async update(
    @Param('userId') userId: string,
    @Body() body: UpdateUserDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<UserSummaryResponse> {
    await this.assertCanManageTarget(request, userId);
    if (
      body.isActive === false &&
      readAuthenticatedPrincipal(request)?.subjectId === userId
    ) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot deactivate your own account',
      });
    }
    return this.usersService.update({
      userId,
      displayName: body.displayName,
      email: body.email,
      organizationalUnitId: body.organizationalUnitId,
      isActive: body.isActive,
    });
  }

  @Delete(':userId')
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
    await this.usersService.delete(userId);
  }

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
    await this.assertCanManageTarget(request, userId);
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
    await this.assertCanManageTarget(request, userId);
    const principal = readAuthenticatedPrincipal(request);
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

function readRequestId(request: AuthenticatedHttpRequest): string | null {
  return readRequestIdHeader(request.headers);
}
