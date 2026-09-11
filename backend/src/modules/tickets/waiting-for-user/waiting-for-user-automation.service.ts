import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import type { TicketRecord } from '../tickets.types';
import { processWaitingForUserTicket } from './process-waiting-for-user-ticket';
import { WaitingForUserConfigurationLoader } from './waiting-for-user-configuration.loader';
import { waitingForUserAutomationIntervalMs } from './waiting-for-user.constants';

@Injectable()
export class WaitingForUserAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: WaitingForUserConfigurationLoader,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  @Interval(waitingForUserAutomationIntervalMs)
  async handleInterval(): Promise<void> {
    await this.processDue();
  }

  async processDue(now = new Date()): Promise<readonly TicketRecord[]> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled) {
      return [];
    }
    const waiting = (await this.prisma.ticket.findMany({
      where: { status: 'WAITING_FOR_USER' },
    })) as TicketRecord[];
    const processed: TicketRecord[] = [];
    for (const ticket of waiting) {
      const messages: TicketPersistedMessageSink = [];
      const next = await processWaitingForUserTicket({
        prisma: this.prisma,
        ticket,
        configuration,
        now,
        messages,
      });
      if (next.id === ticket.id && next.status === ticket.status &&
          next.waitingForUserReminderSentAt === ticket.waitingForUserReminderSentAt) {
        continue;
      }
      publishPersistedTicketMessages(this.realtimeHub, next, messages);
      processed.push(next);
    }
    return processed;
  }
}
