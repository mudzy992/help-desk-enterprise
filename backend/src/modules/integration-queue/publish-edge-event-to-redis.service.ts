import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import { edgeEventRedisChannel } from './integration-queue.constants';
import type { EdgeEventRealtimePublish } from '../tickets/ticket-realtime.types';

@Injectable()
export class PublishEdgeEventToRedisService {
  constructor(@Inject(redisTokens.client) private readonly redisClient: Redis) {}

  async publish(payload: EdgeEventRealtimePublish): Promise<void> {
    if (this.redisClient.status === 'wait') {
      await this.redisClient.connect();
    }
    await this.redisClient.publish(
      edgeEventRedisChannel,
      JSON.stringify(payload),
    );
  }
}
