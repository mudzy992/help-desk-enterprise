import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createAuditChainAnchor, type AuditChainAnchor } from './audit-chain-anchor';
import { AuditLogRepository } from './audit-log.repository';

export type AuditAnchorRuntimeStatus = {
  readonly enabled: boolean;
  readonly ready: boolean;
  readonly reason: 'DISABLED' | 'OK' | 'MISSING_CONFIGURATION' | 'PUBLISH_FAILED' | 'STALE';
  readonly publishLagMs: number | null;
  readonly publishFailuresTotal: number;
  readonly lastPublishedHeadId: string | null;
};

const disabledAnchorStatus: AuditAnchorRuntimeStatus = {
  enabled: false, ready: true, reason: 'DISABLED', publishLagMs: null,
  publishFailuresTotal: 0, lastPublishedHeadId: null,
};
let processAnchorStatusReader: () => AuditAnchorRuntimeStatus = () => disabledAnchorStatus;

export function readAuditAnchorRuntimeStatus(): AuditAnchorRuntimeStatus {
  return processAnchorStatusReader();
}

export interface AuditAnchorSink {
  putImmutable(anchor: AuditChainAnchor): Promise<void>;
}

export class HttpWormAuditAnchorSink implements AuditAnchorSink {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}
  async putImmutable(anchor: AuditChainAnchor): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/u, '')}/${encodeURIComponent(anchor.chainHeadId)}.json`, {
      method: 'PUT', headers: { 'content-type': 'application/json', 'if-none-match': '*' }, body: JSON.stringify(anchor),
    });
    if (!response.ok) throw new Error(`AUDIT_ANCHOR_SINK_${response.status}`);
    const verification = await this.fetcher(`${this.baseUrl.replace(/\/$/u, '')}/${encodeURIComponent(anchor.chainHeadId)}.json`, { method: 'GET', cache: 'no-store' });
    if (!verification.ok) throw new Error(`AUDIT_ANCHOR_VERIFY_${verification.status}`);
    const stored = await verification.json() as AuditChainAnchor;
    if (stored.chainHeadId !== anchor.chainHeadId || stored.chainHeadHash !== anchor.chainHeadHash || stored.signature !== anchor.signature) {
      throw new Error('AUDIT_ANCHOR_VERIFY_MISMATCH');
    }
  }
}

export type AuditAnchorRuntimeConfiguration = {
  readonly enabled: boolean;
  readonly baseUrl: string | null;
  readonly key: string | null;
  readonly keyId: string | null;
  readonly intervalMs: number;
  readonly maxLagMs: number;
};

export function loadAuditAnchorRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): AuditAnchorRuntimeConfiguration {
  const enabled = env.AUDIT_ANCHOR_ENABLED === 'true';
  const intervalMs = Number(env.AUDIT_ANCHOR_INTERVAL_MS ?? 60_000);
  const maxLagMs = Number(env.AUDIT_ANCHOR_MAX_LAG_MS ?? 300_000);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || !Number.isSafeInteger(maxLagMs) || maxLagMs < intervalMs) {
    throw new Error('AUDIT_ANCHOR_INTERVAL_INVALID');
  }
  return { enabled, baseUrl: env.AUDIT_ANCHOR_WORM_URL ?? null, key: env.AUDIT_ANCHOR_HMAC_KEY ?? null, keyId: env.AUDIT_ANCHOR_KEY_ID ?? null, intervalMs, maxLagMs };
}

@Injectable()
export class AuditAnchorRuntimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AuditAnchorRuntimeService.name);
  private timer?: ReturnType<typeof setInterval>;
  private failures = 0;
  private lastPublishedAt: number | null = null;
  private lastPublishedHeadId: string | null = null;
  private sink: AuditAnchorSink | null = null;
  private readonly configuration: AuditAnchorRuntimeConfiguration;

  constructor(private readonly repository: AuditLogRepository) {
    this.configuration = loadAuditAnchorRuntimeConfiguration();
    if (this.configuration.baseUrl !== null) this.sink = new HttpWormAuditAnchorSink(this.configuration.baseUrl);
    processAnchorStatusReader = () => this.status();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configuration.enabled) return;
    this.assertConfigured();
    await this.publish();
    this.timer = setInterval(() => void this.publish().catch((error: unknown) => this.logger.error('audit_anchor_publish_failed', error)), this.configuration.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void { if (this.timer !== undefined) clearInterval(this.timer); }

  async publish(now = new Date()): Promise<void> {
    try {
      this.assertConfigured();
      const heads = await this.repository.findChainHeads();
      if (heads.length === 0) { this.lastPublishedAt = now.getTime(); return; }
      const canonicalHeads = heads
        .map((head) => `${head.chainPartition ?? 'global'}:${head.id}:${head.hash}`)
        .sort()
        .join('\n');
      const aggregateHash = createHash('sha256').update(canonicalHeads).digest('hex');
      const latest = [...heads].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]!;
      const head = { id: `partitions-${aggregateHash}`, hash: aggregateHash, createdAt: latest.createdAt };
      const anchor = createAuditChainAnchor({ key: this.configuration.key!, keyId: this.configuration.keyId!, chainHead: head, now });
      await this.sink!.putImmutable(anchor);
      this.lastPublishedAt = now.getTime();
      this.lastPublishedHeadId = head.id;
    } catch (error) {
      this.failures += 1;
      throw error;
    }
  }

  status(now = new Date()): AuditAnchorRuntimeStatus {
    if (!this.configuration.enabled) return { enabled: false, ready: true, reason: 'DISABLED', publishLagMs: null, publishFailuresTotal: this.failures, lastPublishedHeadId: null };
    if (!this.isConfigured()) return { enabled: true, ready: false, reason: 'MISSING_CONFIGURATION', publishLagMs: null, publishFailuresTotal: this.failures, lastPublishedHeadId: null };
    if (this.lastPublishedAt === null) return { enabled: true, ready: false, reason: this.failures > 0 ? 'PUBLISH_FAILED' : 'STALE', publishLagMs: null, publishFailuresTotal: this.failures, lastPublishedHeadId: this.lastPublishedHeadId };
    const lag = now.getTime() - this.lastPublishedAt;
    return { enabled: true, ready: lag <= this.configuration.maxLagMs, reason: lag <= this.configuration.maxLagMs ? 'OK' : 'STALE', publishLagMs: lag, publishFailuresTotal: this.failures, lastPublishedHeadId: this.lastPublishedHeadId };
  }

  private isConfigured(): boolean { return this.sink !== null && (this.configuration.key?.length ?? 0) >= 32 && Boolean(this.configuration.keyId); }
  private assertConfigured(): void { if (!this.isConfigured()) throw new Error('AUDIT_ANCHOR_CONFIGURATION_REQUIRED'); }
}
