import { Controller, Get, Res } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { schemaCompatibilityQuery } from '../../common/database/database-runtime-contract';
import { RedisService } from '../../common/redis/redis.service';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';
import { readAuditAnchorRuntimeStatus } from '../audit-log/audit-anchor-runtime.service';
import { WebsocketAdapterHealthService } from '../websocket/websocket-adapter-health.service';
import {
  CachedProbe,
  defaultWorkerHeartbeatStaleSeconds,
  evaluateWorkerHeartbeat,
  probeReadiness,
  readinessCacheMs,
  readinessTimeouts,
  withTimeout,
  withWebsocketAdapterHealth,
  type ReadinessResult,
  type WorkerProbeResult,
} from './health-probes';

type StatusResponse = { status(code: number): unknown };

/**
 * `/health` stays a pure liveness probe. `/health/ready` checks database,
 * Redis, the audit anchor and effective WebSocket adapter state (503 on failure)
 * for Coolify/Docker and external monitors. `/health/worker` exposes heartbeat
 * age. Database/Redis checks are cached for 5 s; adapter state is read per request.
 */
@Controller('health')
export class HealthController {
  private readonly readiness: CachedProbe<ReadinessResult>;
  private readonly worker: CachedProbe<WorkerProbeResult>;

  constructor(
    prisma: PrismaService,
    redis: RedisService,
    private readonly websocketAdapterHealth: WebsocketAdapterHealthService,
  ) {
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
    const cachedDependencies = await this.readiness.get();
    // Adapter health changes on Redis events/probe results, so do not let the
    // five-second dependency cache delay either a degraded or recovered signal.
    const result = withWebsocketAdapterHealth(
      cachedDependencies,
      this.websocketAdapterHealth.isReady(),
    );
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
