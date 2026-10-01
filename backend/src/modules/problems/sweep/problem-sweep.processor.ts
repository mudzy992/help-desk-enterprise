import { Processor, WorkerHost } from '@nestjs/bullmq';
import { problemSweepQueueName } from './problem-sweep.constants';
import { ProblemSweepService } from './problem-sweep.service';

/** Paket 3.3 (P5): hourly tick; the service decides what is due. */
@Processor(problemSweepQueueName)
export class ProblemSweepProcessor extends WorkerHost {
  constructor(private readonly sweep: ProblemSweepService) {
    super();
  }

  async process(): Promise<void> {
    await this.sweep.run();
  }
}
