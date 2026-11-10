import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  readAuthenticatedPrincipal,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ListIntegrationJobsQueryDto } from './dto/list-integration-jobs-query.dto';
import { mapIntegrationQueueError } from './map-integration-queue-error';
import { IntegrationQueueService } from './integration-queue.service';
import type {
  IntegrationJobPageResponse,
  IntegrationJobResponse,
  IntegrationWorkerStatusResponse,
} from './integration-queue.types';

@Controller('integration-jobs')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@RequirePermissions(permissionKeys.integrationsQueueManage)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class IntegrationQueueController {
  constructor(
    private readonly integrationQueueService: IntegrationQueueService,
  ) {}

  @Get()
  async list(
    @Query() query: ListIntegrationJobsQueryDto,
  ): Promise<IntegrationJobPageResponse> {
    try {
      return await this.integrationQueueService.list(
        query.status,
        query.cursor ?? null,
      );
    } catch (error) {
      throw mapIntegrationQueueError(error);
    }
  }

  @Get('worker-status')
  async workerStatus(): Promise<IntegrationWorkerStatusResponse> {
    try {
      return await this.integrationQueueService.getWorkerStatus();
    } catch (error) {
      throw mapIntegrationQueueError(error);
    }
  }

  @Post(':jobId/retry')
  async retryNow(
    @Param('jobId') jobId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<IntegrationJobResponse> {
    const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
    if (actorUserId.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Authorization failed',
      });
    }
    try {
      return await this.integrationQueueService.retryNow(jobId, actorUserId);
    } catch (error) {
      throw mapIntegrationQueueError(error);
    }
  }
}
