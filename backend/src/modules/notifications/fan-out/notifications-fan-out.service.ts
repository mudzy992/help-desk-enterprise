import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import { fanOutInAppNotifications } from './fan-out-in-app-notifications';

@Injectable()
export class NotificationsFanOutService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsFanOutService.name);
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.ticketRealtimeHub.subscribe((payload) => {
      void this.ingest(payload);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  private async ingest(payload: TicketRealtimeMessagePayload): Promise<void> {
    try {
      await fanOutInAppNotifications(this.prisma, payload);
    } catch (error) {
      this.logger.error(
        `Failed to persist in-app notification for ticket ${payload.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
