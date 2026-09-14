import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { handleIntegrationJobFailure } from './handle-integration-job-failure';
import { integrationQueueName } from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';
import type { IntegrationQueueJobData } from './integration-queue.types';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { ProcessEdgeEventIntegrationJobService } from './process-edge-event-integration-job.service';
import { ProcessEmailIntegrationJobService } from './process-email-integration-job.service';
import { ProcessTeamsStubIntegrationJobService } from './process-teams-stub-integration-job.service';
import { SettingsService } from '../settings/settings.service';

@Processor(integrationQueueName)
export class IntegrationQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(IntegrationQueueProcessor.name);

  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    private readonly settingsService: SettingsService,
    private readonly processEmailIntegrationJobService: ProcessEmailIntegrationJobService,
    private readonly processEdgeEventIntegrationJobService: ProcessEdgeEventIntegrationJobService,
    private readonly processTeamsStubIntegrationJobService: ProcessTeamsStubIntegrationJobService,
    @InjectQueue(integrationQueueName)
    private readonly integrationQueue: Queue<IntegrationQueueJobData>,
  ) {
    super();
  }

  async process(job: Job<IntegrationQueueJobData>): Promise<void> {
    const integrationJobId = job.data.integrationJobId;
    const record =
      await this.integrationJobRepository.findById(integrationJobId);
    if (record === null) {
      this.logger.warn(`integration_job missing id=${integrationJobId}`);
      return;
    }
    if (
      record.status === IntegrationJobStatus.COMPLETED ||
      record.status === IntegrationJobStatus.DLQ
    ) {
      return;
    }
    const settings = await loadIntegrationQueueSettings(this.settingsService);
    const processing =
      await this.integrationJobRepository.markProcessing(integrationJobId);
    try {
      await this.dispatch(processing.type, processing.payload);
      await this.integrationJobRepository.markCompleted(integrationJobId);
      this.logger.log(
        `integration_job id=${integrationJobId} type=${processing.type} status=COMPLETED`,
      );
    } catch (error) {
      await handleIntegrationJobFailure({
        repository: this.integrationJobRepository,
        queue: this.integrationQueue,
        job: processing,
        settings,
        error,
        log: (message) => this.logger.warn(message),
      });
    }
  }

  private async dispatch(
    type: IntegrationJobType,
    payload: unknown,
  ): Promise<void> {
    if (type === IntegrationJobType.EMAIL) {
      await this.processEmailIntegrationJobService.process(payload);
      return;
    }
    if (type === IntegrationJobType.EDGE_EVENT) {
      await this.processEdgeEventIntegrationJobService.process(payload);
      return;
    }
    if (type === IntegrationJobType.TEAMS_STUB) {
      await this.processTeamsStubIntegrationJobService.process(payload);
      return;
    }
    throw new Error(`Unsupported integration job type: ${type}`);
  }
}
