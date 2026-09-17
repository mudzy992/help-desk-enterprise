import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { LinkUserDirectoryIdentityDto } from './dto/link-user-directory-identity.dto';
import type {
  ResetUserPasswordResponse,
  UserSummaryResponse,
} from './users.types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class UserDirectoryIdentityController {
  constructor(private readonly usersService: UsersService) {}

  @Post(':userId/link-directory-identity')
  linkDirectoryIdentity(
    @Param('userId') userId: string,
    @Body() body: LinkUserDirectoryIdentityDto,
  ): Promise<UserSummaryResponse> {
    return this.usersService.linkDirectoryIdentity({
      userId,
      directoryExternalId: body.directoryExternalId,
    });
  }

  @Delete(':userId/link-directory-identity')
  unlinkDirectoryIdentity(
    @Param('userId') userId: string,
  ): Promise<ResetUserPasswordResponse> {
    return this.usersService.unlinkDirectoryIdentity(userId);
  }
}
