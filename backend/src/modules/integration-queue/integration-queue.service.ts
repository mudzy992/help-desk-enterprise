import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { integrationQueueName } from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';
import { IntegrationQueueError } from './integration-queue.error';
import type {
  IntegrationJobResponse,
  IntegrationQueueJobData,
} from './integration-queue.types';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { SettingsService } from '../settings/settings.service';
import { toIntegrationJobResponse } from './to-integration-job-response';

@Injectable()
export class IntegrationQueueService {
  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    private readonly settingsService: SettingsService,
    @InjectQueue(integrationQueueName)
    private readonly integrationQueue: Queue<IntegrationQueueJobData>,
  ) {}

  async list(status: IntegrationJobStatus): Promise<readonly IntegrationJobResponse[]> {
    await this.assertAdminUiEnabled();
    const jobs = await this.integrationJobRepository.listByStatus(status);
    return jobs.map(toIntegrationJobResponse);
  }

  async retryNow(jobId: string): Promise<IntegrationJobResponse> {
    await this.assertAdminUiEnabled();
    const existing = await this.integrationJobRepository.findById(jobId);
    if (existing === null) {
      throw new IntegrationQueueError('NOT_FOUND');
    }
    if (
      existing.status !== IntegrationJobStatus.FAILED &&
      existing.status !== IntegrationJobStatus.DLQ
    ) {
      throw new IntegrationQueueError('INVALID_STATUS');
    }
    const pending = await this.integrationJobRepository.resetForAdminRetry(jobId);
    if (pending.type !== IntegrationJobType.TEAMS_STUB) {
      await this.integrationQueue.add(
        pending.type,
        { integrationJobId: pending.id },
        {
          jobId: `${pending.id}:admin:${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
    return toIntegrationJobResponse(pending);
  }

  private async assertAdminUiEnabled(): Promise<void> {
    const settings = await loadIntegrationQueueSettings(this.settingsService);
    if (!settings.adminUiEnabled) {
      throw new IntegrationQueueError('ADMIN_UI_DISABLED');
    }
  }
}
