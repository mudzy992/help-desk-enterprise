import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatSlaScanSample, slaScanLogContext } from './format-sla-scan-sample';
import { slaScanBatchSize } from './sla.constants';
import { slaScanQueueName } from './sla-scan.constants';
import { TicketSlaTimersService } from './ticket-sla-timers.service';

/**
 * Phase 2.1 (plan §2.1): the scan runs here — in the worker process — and not in
 * the API. No HTTP latency spike can come from it any more, and the API log has
 * no `sla_scan_…` lines at all (part of the acceptance criteria).
 *
 * A failing cycle throws, so BullMQ retries it (see the scheduler options) and
 * keeps the failure visible instead of swallowing it.
 */
@Processor(slaScanQueueName)
export class SlaScanProcessor extends WorkerHost {
  private readonly logger = new Logger(slaScanLogContext);

  constructor(private readonly timers: TicketSlaTimersService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    const processed = (await this.timers.scanDue()).length;
    this.logger.log(
      formatSlaScanSample({
        durationMs: Date.now() - startedAt,
        processed,
        batchLimit: slaScanBatchSize,
        // Anything above the batch size is picked up by the next cycle: every
        // state keeps its own `nextDueAt`.
        remaining: Math.max(0, processed - slaScanBatchSize),
      }),
    );
  }
}
