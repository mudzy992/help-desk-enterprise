import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { backfillMissingTicketSlaStates } from './backfill-missing-ticket-sla-states';
import { countDueTicketSlaStates } from './count-due-ticket-sla-states';
import { scanDueTicketSlaStates } from './scan-due-ticket-sla-states';
import { syncTicketSlaTimers } from './sync-ticket-sla-timers';
import type { TicketSlaTimersPort } from './ticket-sla.types';

@Injectable()
export class TicketSlaTimersService implements TicketSlaTimersPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: SlaConfigurationLoader,
  ) {}

  async apply(
    input: Parameters<TicketSlaTimersPort['apply']>[0],
  ): ReturnType<TicketSlaTimersPort['apply']> {
    return syncTicketSlaTimers(this.prisma, {
      ...input,
      configuration: await this.configurationLoader.load(),
    });
  }

  async scanDue(now = new Date()) {
    const configuration = await this.configurationLoader.load();
    const due = await scanDueTicketSlaStates(this.prisma, {
      now,
      configuration,
    });
    // Val 2 (M10/B2): every cycle also adopts a bounded batch of open tickets
    // that never got a clock (no profile/rule/calendar at creation time). They
    // are scanned like any other state from the next cycle on.
    const backfilled = await backfillMissingTicketSlaStates(this.prisma, {
      now,
      configuration,
    });
    return [...due, ...backfilled];
  }

  /**
   * M10 B5 (val 5): states still due after a cycle — the real backlog behind the
   * `sla_scan_remaining` field. Must be called after `scanDue()`, because a
   * processed state moves its `nextDueAt` forward within the cycle.
   */
  async countDue(now = new Date()) {
    const configuration = await this.configurationLoader.load();
    return countDueTicketSlaStates(this.prisma, { now, configuration });
  }
}
