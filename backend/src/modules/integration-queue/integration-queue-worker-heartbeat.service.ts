import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import {
  workerHeartbeatIntervalMilliseconds,
  workerHeartbeatRedisKey,
  workerHeartbeatTimeToLiveSeconds,
} from './integration-queue.constants';

@Injectable()
export class IntegrationQueueWorkerHeartbeatService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    IntegrationQueueWorkerHeartbeatService.name,
  );
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.writeHeartbeat();
    this.timer = setInterval(() => {
      void this.writeHeartbeat();
    }, workerHeartbeatIntervalMilliseconds);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
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
