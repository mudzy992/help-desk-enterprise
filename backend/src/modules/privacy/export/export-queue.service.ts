import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { privacyJobs, privacyQueueName } from '../privacy.constants';

/** API side: the worker builds the package (`export-build-<id>`). */
@Injectable()
export class PrivacyExportQueue {
  constructor(@InjectQueue(privacyQueueName) private readonly queue: Queue) {}

  async enqueue(exportId: string): Promise<void> {
    await this.queue.add(
      privacyJobs.exportBuild,
      { exportId },
      { jobId: `${privacyJobs.exportBuild}-${exportId}`, attempts: 1, removeOnComplete: true, removeOnFail: { count: 20 } },
    );
  }
}
