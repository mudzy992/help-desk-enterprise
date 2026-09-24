import { Module } from '@nestjs/common';
import { PublishTicketRealtimeToRedisService } from './publish-ticket-realtime-to-redis.service';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { TicketRealtimeRedisForwarder } from './ticket-realtime.redis-forwarder';

/**
 * Phase 4.1 (plan §4.1): shared realtime wiring for the worker process.
 *
 * Moving the archive/waiting-for-user sweeps into the worker must not change what
 * users see: those sweeps publish persisted messages and ticket updates through
 * `TicketRealtimeHub`. In the API process the gateway listens on that hub; in the
 * worker nothing does, so this module adds the missing subscriber — the forwarder —
 * which republishes worker-originated events to Redis for the API to emit.
 *
 * The hub is exported, so every worker module that publishes shares one instance
 * (and therefore one forwarder subscription).
 */
@Module({
  providers: [
    TicketRealtimeHub,
    PublishTicketRealtimeToRedisService,
    TicketRealtimeRedisForwarder,
  ],
  exports: [TicketRealtimeHub],
})
export class TicketRealtimeBridgeModule {}
