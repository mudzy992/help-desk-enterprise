import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { DirectorySyncService } from './directory-sync.service';
import { DirectorySyncStatusService } from './directory-sync-status.service';
import type { DirectorySyncStatusResponse } from './directory-sync-status.types';
import type {
  DirectoryReadResult,
  DirectoryUser,
} from './directory-sync.types';
import { DirectoryReadDto } from './dto/directory-read.dto';

@Controller('directory-sync')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class DirectorySyncController {
  constructor(
    private readonly directorySyncService: DirectorySyncService,
    private readonly directorySyncStatusService: DirectorySyncStatusService,
  ) {}

  @Get('status')
  @AdminReadOperation()
  getStatus(): Promise<DirectorySyncStatusResponse> {
    return this.directorySyncStatusService.getStatus();
  }

  @Get('directory-users')
  @AdminReadOperation()
  listDirectoryUsers(): Promise<readonly DirectoryUser[]> {
    return this.directorySyncService.listDirectoryUsersForLinking();
  }

  @Post('read')
  @AdminReadOperation()
  read(@Body() body: DirectoryReadDto): Promise<DirectoryReadResult> {
    return this.directorySyncService.read({
      operation: body.operation,
      scope: body.scope,
      forceRefresh: body.forceRefresh === true,
    });
  }
}
