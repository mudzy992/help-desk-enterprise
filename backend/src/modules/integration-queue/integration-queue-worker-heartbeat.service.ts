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
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Phase 4.1 (plan §4.1): the periodic part moved to a BullMQ schedule
   * (`integration-worker-maintenance.scheduler.service.ts`) so two workers write
   * one heartbeat instead of two. The immediate write stays: without it the health
   * check would flap to "stale" for the first interval after every restart.
   *
   * Incident 2026-10-17: the schedule alone is a single point of failure for a
   * *liveness* signal. It is registered once, at boot, by `registerRepeatableJob`
   * which only logs when Redis refuses it (`integration_worker_heartbeat_schedule_failed`),
   * and its jobs are processed by a `concurrency: 1` worker shared with the DLQ
   * sweep. Lose the registration (Redis blip at boot, Redis restart or flush, a
   * failover) or stall the sweep and the heartbeat stops while the worker process
   * is perfectly alive — the key then expires and `worker.down` opens with
   * `heartbeatMissing: true`, i.e. exactly the false alarm this signal exists to
   * avoid. So the process also writes it on its own timer: one SET every 10 s,
   * which is what the pre-4.1 `setInterval` did. Two workers writing the same
   * timestamp is harmless (the plan says so explicitly); a heartbeat that depends
   * on queue machinery to prove the queue machinery is alive is not.
   *
   * Division of labour stays clean: this key means "a worker process is up and
   * can reach Redis", while `ops:snapshot` (ops-health schedule) means "the queue
   * machinery runs" — `ops.monitor.stale` is the alarm for the latter.
   */
  async onModuleInit(): Promise<void> {
    await this.writeHeartbeat();
    this.startLocalTimer();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private startLocalTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.writeHeartbeat();
    }, workerHeartbeatIntervalMilliseconds);
    // The worker has its own keep-alive timer; this one must never hold the
    // process open (and must not keep a jest worker alive after a spec).
    this.timer.unref?.();
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
