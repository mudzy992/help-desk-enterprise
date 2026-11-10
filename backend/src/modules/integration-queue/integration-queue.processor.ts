import { randomUUID } from 'node:crypto';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { handleIntegrationJobFailure } from './handle-integration-job-failure';
import { assertIntegrationJobPayloadWithinLimits } from './integration-job-payload-limits';
import {
  integrationJobProcessingLeaseDurationMilliseconds,
  integrationQueueName,
} from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';
import type { IntegrationQueueJobData } from './integration-queue.types';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { isQueuedIntegrationJobType } from './parse-integration-queue-types';
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
    // Runtime disable is a pause, not a failure: while the queue or this job
    // type is disabled the row is never claimed, so it consumes no attempt,
    // keeps its retry schedule, and resumes when the type is re-enabled. The
    // periodic reconciler re-offers it (it also skips disabled types), and a
    // Bull job that still fires lands here and returns without side effects.
    const current = await this.integrationJobRepository.findTypeAndStatus(integrationJobId);
    if (current === null) {
      this.logger.debug(
        `integration_job claim_skipped id=${integrationJobId} attemptId=${attemptId} reason=not_found`,
      );
      return;
    }
    if (!settings.enabled || !isQueuedIntegrationJobType(current.type, settings.typeTokens)) {
      this.logger.warn(
        `integration_job_dispatch_paused id=${integrationJobId} type=${current.type} reason=${settings.enabled ? 'type_disabled' : 'queue_disabled'}`,
      );
      return;
    }
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
      assertIntegrationJobPayloadWithinLimits(processing.type, processing.payload);
      const dispatchedStatus = await this.dispatch(
        processing.type,
        processing.payload,
      );
      const terminalStatus =
        dispatchedStatus ?? IntegrationJobStatus.COMPLETED;
      const transitioned =
        dispatchedStatus === IntegrationJobStatus.PUBLISHED_BEST_EFFORT
          ? await this.integrationJobRepository.markPublishedBestEffort(
              processing,
            )
          : await this.integrationJobRepository.markCompleted(processing);
      if (!transitioned) {
        this.logger.warn(
          `integration_job terminal_transition_fenced id=${integrationJobId} attemptId=${attemptId} status=${terminalStatus}`,
        );
        return;
      }
      this.logger.log(
        `integration_job id=${integrationJobId} type=${processing.type} status=${terminalStatus}`,
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
  ): Promise<typeof IntegrationJobStatus.PUBLISHED_BEST_EFFORT | null> {
    if (type === IntegrationJobType.EMAIL) {
      await this.processEmailIntegrationJobService.process(payload);
      return null;
    }
    if (type === IntegrationJobType.EDGE_EVENT) {
      const status = await this.processEdgeEventIntegrationJobService.process(
        payload,
      );
      if (status !== IntegrationJobStatus.PUBLISHED_BEST_EFFORT) {
        throw new Error('EDGE_EVENT dispatch did not return PUBLISHED_BEST_EFFORT');
      }
      return status;
    }
    if (type === IntegrationJobType.TEAMS) {
      await this.teamsDeliveryService.process(payload);
      return null;
    }
    throw new Error(`Unsupported integration job type: ${type}`);
  }
}
