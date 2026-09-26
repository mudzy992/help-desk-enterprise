import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
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
import { DirectoryApplyDto } from './dto/directory-apply.dto';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import { DirectoryFullSyncService } from './ldaps/directory-full-sync.service';
import { mapDirectorySyncError } from './map-directory-sync-error';

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
    private readonly directoryFullSyncService: DirectoryFullSyncService,
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

  // Paket 1.8 (A4): LDAPS test connection, dry-run, apply and history.
  @Post('test-connection')
  @AdminReadOperation()
  testConnection(@Req() request: AuthenticatedHttpRequest) {
    return mapped(() => this.directoryFullSyncService.testConnection(actorOf(request)));
  }

  @Post('dry-run')
  @AdminReadOperation()
  dryRun(@Req() request: AuthenticatedHttpRequest) {
    return mapped(() => this.directoryFullSyncService.dryRun(actorOf(request)));
  }

  @Post('apply')
  apply(@Body() body: DirectoryApplyDto, @Req() request: AuthenticatedHttpRequest) {
    return mapped(() => this.directoryFullSyncService.apply(body.dryRunId, actorOf(request)));
  }

  @Get('runs')
  @AdminReadOperation()
  listRuns() {
    return mapped(() => this.directoryFullSyncService.listRuns());
  }

  @Get('runs/:runId/plan')
  @AdminReadOperation()
  getRunPlan(@Param('runId') runId: string) {
    return mapped(() => this.directoryFullSyncService.getRunPlan(runId));
  }
}

function actorOf(request: AuthenticatedHttpRequest): string | null {
  return request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY]?.subjectId ?? null;
}

async function mapped<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw mapDirectorySyncError(error);
  }
}
