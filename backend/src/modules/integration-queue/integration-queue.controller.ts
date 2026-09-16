import {
  Controller,
  Get,
  Param,
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
import { ListIntegrationJobsQueryDto } from './dto/list-integration-jobs-query.dto';
import { mapIntegrationQueueError } from './map-integration-queue-error';
import { IntegrationQueueService } from './integration-queue.service';
import type {
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
  ): Promise<readonly IntegrationJobResponse[]> {
    try {
      return await this.integrationQueueService.list(query.status);
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
  ): Promise<IntegrationJobResponse> {
    try {
      return await this.integrationQueueService.retryNow(jobId);
    } catch (error) {
      throw mapIntegrationQueueError(error);
    }
  }
}
