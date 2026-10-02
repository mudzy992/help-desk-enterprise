import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import { TeamsDeliveryService } from './teams-delivery.service';

const debounceMs = 1_500;

/**
 * Paket 3.1 (§8): when a ticket changes (claimed, status, priority) the cards
 * already posted for it are updated, debounced so a burst of edits costs one
 * refresh. Only tickets that have cards cause any Teams traffic.
 */
@Injectable()
export class TeamsCardRefresher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeamsCardRefresher.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly hub: TicketRealtimeHub,
    private readonly delivery: TeamsDeliveryService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.hub.subscribeTicketUpdated((payload) => this.schedule(payload.ticketId));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  schedule(ticketId: string): void {
    const existing = this.timers.get(ticketId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(ticketId);
      void this.delivery.refreshEntityCards('ticket', ticketId).catch((error: unknown) => {
        this.logger.warn(`teams_ticket_refresh_failed ticket=${ticketId} reason=${error instanceof Error ? error.message : String(error)}`);
      });
    }, debounceMs);
    timer.unref?.();
    this.timers.set(ticketId, timer);
  }
}
