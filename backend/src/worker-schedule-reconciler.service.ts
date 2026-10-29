import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { RedisService } from './common/redis/redis.service';
import { workerLifecycleRedisKey } from './worker-lifecycle';

export const workerScheduleReconcileIntervalMs = 5 * 60_000;
type Scheduler = { onModuleInit(): Promise<void> };

@Injectable()
export class WorkerScheduleReconcilerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerScheduleReconcilerService.name);
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly discovery: DiscoveryService, private readonly redis: RedisService) {}

  async onApplicationBootstrap(): Promise<void> {
    // Every scheduler already registered once during module init. Reassert all of
    // them after the complete graph is ready, then periodically heal Redis loss.
    await this.reconcile();
    this.timer = setInterval(() => { void this.reconcile().catch(() => undefined); }, workerScheduleReconcileIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async reconcile(): Promise<void> {
    const schedulers = this.discovery.getProviders()
      .map(({ instance }) => instance as Partial<Scheduler> | null)
      .filter((instance): instance is Scheduler => Boolean(
        instance && instance.constructor.name.endsWith('SchedulerService') && typeof instance.onModuleInit === 'function',
      ));
    try {
      for (const scheduler of schedulers) await scheduler.onModuleInit();
      this.logger.log(`mandatory_schedule_reconcile_ok count=${schedulers.length}`);
    } catch (error) {
      await this.redis.getClient().set(workerLifecycleRedisKey, JSON.stringify({ state: 'degraded', at: new Date().toISOString() }), 'EX', 120).catch(() => undefined);
      this.logger.error(`mandatory_schedule_reconcile_failed type=${error instanceof Error ? error.name : 'UnknownError'}`);
      throw error;
    }
  }
}
