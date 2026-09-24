import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import {
  workerHeartbeatRedisKey,
  workerHeartbeatTimeToLiveSeconds,
} from './integration-queue.constants';

@Injectable()
export class IntegrationQueueWorkerHeartbeatService implements OnModuleInit {
  private readonly logger = new Logger(
    IntegrationQueueWorkerHeartbeatService.name,
  );

  constructor(private readonly redisService: RedisService) {}

  /**
   * Phase 4.1 (plan §4.1): the periodic part moved to a BullMQ schedule
   * (`integration-worker-maintenance.scheduler.service.ts`) so two workers write
   * one heartbeat instead of two. The immediate write stays: without it the health
   * check would flap to "stale" for the first interval after every restart.
   */
  async onModuleInit(): Promise<void> {
    await this.writeHeartbeat();
  }

  async writeHeartbeat(): Promise<void> {
    const timestamp = new Date().toISOString();
    try {
      await this.redisService
        .getClient()
        .set(
          workerHeartbeatRedisKey,
          timestamp,
          'EX',
          workerHeartbeatTimeToLiveSeconds,
        );
    } catch (error) {
      this.logger.warn(
        `Failed to write worker heartbeat: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
