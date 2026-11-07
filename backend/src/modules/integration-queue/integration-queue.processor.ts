import { randomUUID } from 'node:crypto';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { IntegrationJobType } from '../../generated/prisma/enums';
import { handleIntegrationJobFailure } from './handle-integration-job-failure';
import {
  integrationJobProcessingLeaseDurationMilliseconds,
  integrationQueueName,
} from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';
import type { IntegrationQueueJobData } from './integration-queue.types';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { ProcessEdgeEventIntegrationJobService } from './process-edge-event-integration-job.service';
import { ProcessEmailIntegrationJobService } from './process-email-integration-job.service';
import { SettingsService } from '../settings/settings.service';
import { TeamsDeliveryService } from '../teams/teams-delivery.service';

@Processor(integrationQueueName)
export class IntegrationQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(IntegrationQueueProcessor.name);

  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    private readonly settingsService: SettingsService,
    private readonly processEmailIntegrationJobService: ProcessEmailIntegrationJobService,
    private readonly processEdgeEventIntegrationJobService: ProcessEdgeEventIntegrationJobService,
    private readonly teamsDeliveryService: TeamsDeliveryService,
    @InjectQueue(integrationQueueName)
    private readonly integrationQueue: Queue<IntegrationQueueJobData>,
  ) {
    super();
  }

  async process(job: Job<IntegrationQueueJobData>): Promise<void> {
    const integrationJobId = job.data.integrationJobId;
    const attemptId = job.id;
    if (typeof attemptId !== 'string' || attemptId.length === 0) {
      this.logger.warn(
        `integration_job claim_skipped id=${integrationJobId} reason=missing_attempt_id`,
      );
      return;
    }

    // Read configuration before claiming so a transient settings failure cannot
    // strand a durable row in PROCESSING.
    const settings = await loadIntegrationQueueSettings(this.settingsService);
    const now = new Date();
    const processing = await this.integrationJobRepository.claimForProcessing({
      id: integrationJobId,
      attemptId,
      ownerToken: randomUUID(),
      now,
      leaseExpiresAt: new Date(
        now.getTime() + integrationJobProcessingLeaseDurationMilliseconds,
      ),
    });
    if (processing === null) {
      // Duplicate/stale Bull deliveries are expected to lose this CAS; they
      // complete without calling a provider or mutating the row.
      this.logger.debug(
        `integration_job claim_skipped id=${integrationJobId} attemptId=${attemptId} reason=not_current`,
      );
      return;
    }

    try {
      await this.dispatch(processing.type, processing.payload);
      const completed = await this.integrationJobRepository.markCompleted(processing);
      if (!completed) {
        this.logger.warn(
          `integration_job completion_fenced id=${integrationJobId} attemptId=${attemptId}`,
        );
        return;
      }
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
    if (type === IntegrationJobType.TEAMS) {
      await this.teamsDeliveryService.process(payload);
      return;
    }
    throw new Error(`Unsupported integration job type: ${type}`);
  }
}
