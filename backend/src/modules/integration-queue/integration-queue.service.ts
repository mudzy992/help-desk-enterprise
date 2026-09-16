import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { IntegrationJobStatus } from '../../generated/prisma/enums';
import { RedisService } from '../../common/redis/redis.service';
import {
  integrationQueueName,
  workerHeartbeatRedisKey,
  workerHeartbeatStaleThresholdMilliseconds,
} from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';
import { IntegrationQueueError } from './integration-queue.error';
import type {
  IntegrationJobResponse,
  IntegrationQueueJobData,
  IntegrationWorkerStatusResponse,
} from './integration-queue.types';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { resolveWorkerHeartbeatStatus } from './resolve-worker-heartbeat-status';
import { SettingsService } from '../settings/settings.service';
import { toIntegrationJobResponse } from './to-integration-job-response';

@Injectable()
export class IntegrationQueueService {
  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    private readonly settingsService: SettingsService,
    @InjectQueue(integrationQueueName)
    private readonly integrationQueue: Queue<IntegrationQueueJobData>,
    private readonly redisService: RedisService,
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
    await this.integrationQueue.add(
      pending.type,
      { integrationJobId: pending.id },
      {
        jobId: `${pending.id}:admin:${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return toIntegrationJobResponse(pending);
  }

  async getWorkerStatus(): Promise<IntegrationWorkerStatusResponse> {
    await this.assertAdminUiEnabled();
    let lastHeartbeatAt: string | null = null;
    try {
      const value = await this.redisService
        .getClient()
        .get(workerHeartbeatRedisKey);
      lastHeartbeatAt =
        typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      return { status: 'unknown', lastHeartbeatAt: null };
    }
    return {
      status: resolveWorkerHeartbeatStatus({
        lastHeartbeatAt,
        nowMilliseconds: Date.now(),
        staleThresholdMilliseconds: workerHeartbeatStaleThresholdMilliseconds,
      }),
      lastHeartbeatAt,
    };
  }

  private async assertAdminUiEnabled(): Promise<void> {
    const settings = await loadIntegrationQueueSettings(this.settingsService);
    if (!settings.adminUiEnabled) {
      throw new IntegrationQueueError('ADMIN_UI_DISABLED');
    }
  }
}
