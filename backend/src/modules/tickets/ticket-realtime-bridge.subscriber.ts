import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import {
  subscribeRedisChannel,
  type RedisChannelSubscription,
} from '../../common/redis/subscribe-redis-channel';
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
  private subscription: RedisChannelSubscription | null = null;

  constructor(
    @Inject(redisTokens.client) private readonly redisClient: Redis,
    private readonly hub: TicketRealtimeHub,
  ) {}

  async onModuleInit(): Promise<void> {
    // Val 3: same contract as the edge-event subscriber — a rejected subscription
    // is logged and retried, never thrown out of `onModuleInit`.
    this.subscription = await subscribeRedisChannel({
      source: this.redisClient,
      channel: ticketRealtimeBridgeChannel,
      label: 'ticket_realtime_bridge',
      logger: this.logger,
      onMessage: (_channel, message) => {
        this.dispatch(message);
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscription?.close();
    this.subscription = null;
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
