import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { backfillMissingTicketSlaStates } from './backfill-missing-ticket-sla-states';
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
}
