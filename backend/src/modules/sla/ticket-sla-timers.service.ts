import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaConfigurationLoader } from './sla-configuration.loader';
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
}
