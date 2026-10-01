import { Processor, WorkerHost } from '@nestjs/bullmq';
import { changeSweepQueueName } from './change-sweep.constants';
import { ChangeSweepService } from './change-sweep.service';

/** Paket 3.4 (§14): quarter-hourly tick; the service decides what is due. */
@Processor(changeSweepQueueName)
export class ChangeSweepProcessor extends WorkerHost {
  constructor(private readonly sweep: ChangeSweepService) {
    super();
  }

  async process(): Promise<void> {
    await this.sweep.run();
  }
}
