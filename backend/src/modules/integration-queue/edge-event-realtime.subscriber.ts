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
  private subscriber: Redis | null = null;

  constructor(
    @Inject(redisTokens.client) private readonly redisClient: Redis,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
  ) {}

  async onModuleInit(): Promise<void> {
    const subscriber = this.redisClient.duplicate();
    this.subscriber = subscriber;
    if (subscriber.status === 'wait') {
      await subscriber.connect();
    }
    await subscriber.subscribe(edgeEventRedisChannel);
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
