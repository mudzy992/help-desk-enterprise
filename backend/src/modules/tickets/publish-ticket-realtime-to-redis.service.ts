import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import { ticketRealtimeBridgeChannel } from './ticket-realtime-bridge.constants';
import type { TicketRealtimeBridgePublish } from './ticket-realtime-bridge.types';

/** Worker side of the bridge: see `ticket-realtime-bridge.constants.ts` for why. */
@Injectable()
export class PublishTicketRealtimeToRedisService {
  constructor(@Inject(redisTokens.client) private readonly redisClient: Redis) {}

  async publish(payload: TicketRealtimeBridgePublish): Promise<void> {
    if (this.redisClient.status === 'wait') {
      await this.redisClient.connect();
    }
    await this.redisClient.publish(
      ticketRealtimeBridgeChannel,
      JSON.stringify(payload),
    );
  }
}
