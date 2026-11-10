import { Controller, Get, Res } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { schemaCompatibilityQuery } from '../../common/database/database-runtime-contract';
import { RedisService } from '../../common/redis/redis.service';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';
import { readAuditAnchorRuntimeStatus } from '../audit-log/audit-anchor-runtime.service';
import {
  CachedProbe,
  defaultWorkerHeartbeatStaleSeconds,
  evaluateWorkerHeartbeat,
  probeReadiness,
  readinessCacheMs,
  readinessTimeouts,
  withTimeout,
  type ReadinessResult,
  type WorkerProbeResult,
} from './health-probes';

type StatusResponse = { status(code: number): unknown };

/**
 * `/health` stays a pure liveness probe. Paket 2.7 adds `/health/ready`
 * (database + Redis, 503 on failure) for Coolify/Docker and external monitors,
 * and `/health/worker` (heartbeat age) so a monitor can watch the worker
 * without signing in. Both are cached for 5 s per instance.
 */
@Controller('health')
export class HealthController {
  private readonly readiness: CachedProbe<ReadinessResult>;
  private readonly worker: CachedProbe<WorkerProbeResult>;

  constructor(prisma: PrismaService, redis: RedisService) {
    this.readiness = new CachedProbe(
      () =>
        probeReadiness({
          pingDatabase: async () => {
            await prisma.$queryRaw`SELECT 1`;
            const compatibility = schemaCompatibilityQuery();
            const rows = await prisma.$queryRawUnsafe<Array<{ compatible: boolean }>>(
              compatibility.text,
              ...compatibility.values,
            );
            if (rows[0]?.compatible !== true) throw new Error('database schema is not compatible');
          },
          pingRedis: () => redis.getClient().ping(),
          auditAnchorReady: () => readAuditAnchorRuntimeStatus().ready,
        }),
      readinessCacheMs,
    );
    this.worker = new CachedProbe(async () => {
      let lastHeartbeatAt: string | null = null;
      try {
        lastHeartbeatAt = await withTimeout(() => redis.getClient().get(workerHeartbeatRedisKey), readinessTimeouts.redisMs);
      } catch {
        lastHeartbeatAt = null;
      }
      return evaluateWorkerHeartbeat({
        lastHeartbeatAt,
        nowMs: Date.now(),
        staleSeconds: defaultWorkerHeartbeatStaleSeconds,
      });
    }, readinessCacheMs);
  }

  @Get()
  getHealth(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) response: StatusResponse): Promise<ReadinessResult> {
    const result = await this.readiness.get();
    if (result.status !== 'ok') response.status(503);
    return result;
  }

  @Get('worker')
  async getWorker(@Res({ passthrough: true }) response: StatusResponse): Promise<WorkerProbeResult> {
    const result = await this.worker.get();
    if (result.status !== 'ok') response.status(503);
    return result;
  }
}
