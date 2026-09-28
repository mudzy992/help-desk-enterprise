import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { PrivacyActor } from '../privacy-actor';
import { PrivacyConfigurationLoader } from '../privacy-configuration.loader';
import { privacyErrorCodes, privacyJobs, privacyQueueName, type RetentionCategory } from '../privacy.constants';
import { PrivacyError } from '../privacy.error';

/** API side: dry runs and manual runs are executed by the worker. */
@Injectable()
export class RetentionQueueService {
  constructor(
    @InjectQueue(privacyQueueName) private readonly queue: Queue,
    private readonly configurationLoader: PrivacyConfigurationLoader,
  ) {}

  async enqueue(
    category: RetentionCategory,
    mode: 'DRY_RUN' | 'EXECUTE',
    actor: PrivacyActor,
  ): Promise<{ readonly queued: true; readonly category: RetentionCategory; readonly mode: string }> {
    const configuration = await this.configurationLoader.load();
    if (configuration.retentionDays[category] <= 0) {
      throw new PrivacyError(privacyErrorCodes.retentionDisabled, { category });
    }
    const name = mode === 'DRY_RUN' ? privacyJobs.retentionDryRun : privacyJobs.retentionRunNow;
    await this.queue.add(
      name,
      { category, actorUserId: actor.principal.subjectId },
      {
        // One pending request per category and mode; a double click does not queue twice.
        jobId: `${name}-${category}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 20 },
      },
    );
    return { queued: true, category, mode };
  }
}
