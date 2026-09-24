import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PublishTicketRealtimeToRedisService } from './publish-ticket-realtime-to-redis.service';
import { TicketRealtimeHub } from './ticket-realtime.hub';

/**
 * Phase 4.1: in the worker process nothing is subscribed to the hub (there is no
 * Socket.IO server there), so a sweep's `publishPersistedTicketMessages` would be
 * a no-op. This forwarder is that missing subscriber: everything the worker-side
 * automation puts on the hub is republished to Redis, where the API picks it up
 * and emits it to the same rooms as before.
 *
 * The API process does **not** register this forwarder, so an event the API
 * itself published can never travel the bridge twice.
 */
@Injectable()
export class TicketRealtimeRedisForwarder implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketRealtimeRedisForwarder.name);
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly hub: TicketRealtimeHub,
    private readonly publisher: PublishTicketRealtimeToRedisService,
  ) {}

  onModuleInit(): void {
    this.unsubscribers.push(
      this.hub.subscribe((payload) => {
        void this.forward({ kind: 'message', payload });
      }),
      this.hub.subscribeTicketUpdated((payload) => {
        void this.forward({ kind: 'updated', payload });
      }),
    );
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
  }

  private async forward(payload: Parameters<PublishTicketRealtimeToRedisService['publish']>[0]) {
    try {
      await this.publisher.publish(payload);
    } catch (error) {
      // A dropped bridge message costs one live update, never the sweep itself.
      this.logger.warn(
        `ticket_realtime_bridge_publish_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
