import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { redisTokens } from '../../common/redis/redis.tokens';
import { parseTicketRealtimeBridgePayload } from './parse-ticket-realtime-bridge-payload';
import { ticketRealtimeBridgeChannel } from './ticket-realtime-bridge.constants';
import { TicketRealtimeHub } from './ticket-realtime.hub';

/**
 * API side of the bridge (Phase 4.1): re-publishes worker-originated ticket
 * realtime events into the in-process hub, so the gateways emit them to exactly
 * the rooms they always did. Mirrors `EdgeEventRealtimeSubscriber`.
 */
@Injectable()
export class TicketRealtimeBridgeSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketRealtimeBridgeSubscriber.name);
  private subscriber: Redis | null = null;

  constructor(
    @Inject(redisTokens.client) private readonly redisClient: Redis,
    private readonly hub: TicketRealtimeHub,
  ) {}

  async onModuleInit(): Promise<void> {
    const subscriber = this.redisClient.duplicate();
    this.subscriber = subscriber;
    if (subscriber.status === 'wait') {
      await subscriber.connect();
    }
    await subscriber.subscribe(ticketRealtimeBridgeChannel);
    subscriber.on('message', (_channel, message) => {
      this.dispatch(message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber === null) {
      return;
    }
    await closeRedisClient(this.subscriber);
    this.subscriber = null;
  }

  private dispatch(message: string): void {
    try {
      const payload = parseTicketRealtimeBridgePayload(JSON.parse(message));
      if (payload === null) {
        this.logger.warn('Ignored invalid ticket realtime bridge payload');
        return;
      }
      if (payload.kind === 'message') {
        this.hub.publish(payload.payload);
        return;
      }
      this.hub.publishTicketUpdated(payload.payload);
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch ticket realtime bridge payload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
