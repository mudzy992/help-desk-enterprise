import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { RedisService } from './common/redis/redis.service';
import { workerLifecycleRedisKey } from './worker-lifecycle';

export const workerScheduleReconcileIntervalMs = 5 * 60_000;

type Scheduler = {
  onModuleInit(): Promise<void>;
  /** Throwing reconciliation hook; legacy schedulers fall back to onModuleInit. */
  reconcileSchedule?(): Promise<void>;
};

@Injectable()
export class WorkerScheduleReconcilerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(WorkerScheduleReconcilerService.name);
  private timer: NodeJS.Timeout | null = null;
  private schedulesHealthy = false;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly redis: RedisService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Arm retries before the eager pass. A transient registration failure must
    // not reject Nest bootstrap and prevent the only recovery timer from running.
    if (this.timer === null) {
      this.timer = setInterval(() => {
        void this.reconcile().catch(() => undefined);
      }, workerScheduleReconcileIntervalMs);
      this.timer.unref?.();
    }
    await this.reconcile().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  areSchedulesHealthy(): boolean {
    return this.schedulesHealthy;
  }

  async reconcile(): Promise<void> {
    const schedulers = this.discovery
      .getProviders()
      .map(({ instance }) => instance as Partial<Scheduler> | null)
      .filter(
        (instance): instance is Scheduler =>
          Boolean(
            instance &&
              instance.constructor.name.endsWith('SchedulerService') &&
              typeof instance.onModuleInit === 'function',
          ),
      );
    const failures: unknown[] = [];
    for (const scheduler of schedulers) {
      try {
        if (typeof scheduler.reconcileSchedule === 'function') {
          await scheduler.reconcileSchedule();
        } else {
          await scheduler.onModuleInit();
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 0) {
      this.schedulesHealthy = true;
      this.logger.log(`mandatory_schedule_reconcile_ok count=${schedulers.length}`);
      return;
    }

    this.schedulesHealthy = false;
    await this.redis
      .getClient()
      .set(
        workerLifecycleRedisKey,
        JSON.stringify({ state: 'degraded', at: new Date().toISOString() }),
        'EX',
        120,
      )
      .catch(() => undefined);
    const failure = failures[0];
    this.logger.error(
      `mandatory_schedule_reconcile_failed count=${failures.length} type=${failure instanceof Error ? failure.name : 'UnknownError'}`,
    );
    throw new Error('mandatory schedule reconciliation failed', { cause: failure });
  }
}
