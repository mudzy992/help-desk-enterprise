import { Processor, WorkerHost } from '@nestjs/bullmq';
import { assetRemindersQueueName } from './asset-reminders.constants';
import { AssetRemindersService } from './asset-reminders.service';

/** Paket 3.2 (§10): hourly tick; the service decides whether anything is due. */
@Processor(assetRemindersQueueName)
export class AssetRemindersProcessor extends WorkerHost {
  constructor(private readonly reminders: AssetRemindersService) {
    super();
  }

  async process(): Promise<void> {
    await this.reminders.run();
  }
}
