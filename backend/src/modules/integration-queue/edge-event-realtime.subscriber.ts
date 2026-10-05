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
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import { edgeEventRedisChannel } from './integration-queue.constants';
import {
  parseEdgeEventIntegrationJobPayload,
  toEdgeEventRealtimePublish,
} from './parse-edge-event-integration-job-payload';

@Injectable()
export class EdgeEventRealtimeSubscriber
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EdgeEventRealtimeSubscriber.name);
  private subscription: RedisChannelSubscription | null = null;

  constructor(
    @Inject(redisTokens.client) private readonly redisClient: Redis,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
  ) {}

  async onModuleInit(): Promise<void> {
    // Val 3: a Redis that rejects AUTH must degrade this bridge, not kill the API
    // (`subscribeRedisChannel` logs, retries and returns a no-op subscription).
    this.subscription = await subscribeRedisChannel({
      source: this.redisClient,
      channel: edgeEventRedisChannel,
      label: 'edge_event_realtime',
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
      const parsed: unknown = JSON.parse(message);
      const payload = parseEdgeEventIntegrationJobPayload(parsed);
      if (payload === null) {
        this.logger.warn('Ignored invalid EDGE_EVENT redis payload');
        return;
      }
      this.ticketRealtimeHub.publishEdgeEvent(
        toEdgeEventRealtimePublish(payload),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch EDGE_EVENT: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
