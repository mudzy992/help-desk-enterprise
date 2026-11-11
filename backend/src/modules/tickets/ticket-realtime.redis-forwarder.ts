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
 * itself published can never travel the bridge twice. Its listener returns the
 * Redis promise: the durable message outbox awaits it and retries failures, while
 * other best-effort publishers still isolate errors in TicketRealtimeHub.
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
      this.hub.subscribeAwaited((payload) =>
        this.forward({ kind: 'message', payload }),
      ),
      this.hub.subscribeTicketUpdatedAwaited((payload) =>
        this.forward({ kind: 'updated', payload }),
      ),
      // BA-announcements-20: announcement invalidation travels the same worker->API bridge.
      this.hub.subscribeAnnouncementChanged((payload) =>
        this.forward({ kind: 'announcement-changed', payload }),
      ),
    );
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
  }

  private async forward(payload: Parameters<PublishTicketRealtimeToRedisService['publish']>[0]): Promise<void> {
    try {
      await this.publisher.publish(payload);
    } catch (error) {
      // Durable outbox callers retry; legacy best-effort callers log and isolate.
      this.logger.warn(
        `ticket_realtime_bridge_publish_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
