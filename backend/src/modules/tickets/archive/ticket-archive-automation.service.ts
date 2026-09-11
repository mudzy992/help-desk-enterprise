import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { daysToMilliseconds } from '../apply-ticket-lifecycle-timestamps';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import type { TicketRecord } from '../tickets.types';
import { TicketGuardrailsConfigurationLoader } from '../guardrails/ticket-guardrails-configuration.loader';
import { ticketArchiveAutomationIntervalMs } from './archive.constants';
import { processClosedTicketArchive } from './process-closed-ticket-archive';
import { TicketArchiveConfigurationLoader } from './ticket-archive-configuration.loader';

@Injectable()
export class TicketArchiveAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: TicketArchiveConfigurationLoader,
    private readonly guardrailsLoader: TicketGuardrailsConfigurationLoader,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  @Interval(ticketArchiveAutomationIntervalMs)
  async handleInterval(): Promise<void> {
    await this.processDue();
  }

  async processDue(now = new Date()): Promise<readonly TicketRecord[]> {
    const configuration = await this.configurationLoader.load();
    const guardrails = await this.guardrailsLoader.load();
    if (!configuration.enabled) {
      return [];
    }
    const cutoff = new Date(
      now.getTime() - daysToMilliseconds(configuration.afterClosedDays),
    );
    const closed = (await this.prisma.ticket.findMany({
      where: { status: 'CLOSED', closedAt: { lte: cutoff } },
    })) as TicketRecord[];
    const processed: TicketRecord[] = [];
    for (const ticket of closed) {
      const messages: TicketPersistedMessageSink = [];
      const next = await processClosedTicketArchive({
        prisma: this.prisma,
        ticket,
        configuration,
        guardrails,
        now,
        messages,
      });
      if (next.status === ticket.status) {
        continue;
      }
      publishPersistedTicketMessages(this.realtimeHub, next, messages);
      processed.push(next);
    }
    return processed;
  }
}
