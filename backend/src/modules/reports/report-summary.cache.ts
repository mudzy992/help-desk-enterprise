import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import {
  dashboardSummaryCacheKey,
  readReportSummaryCache,
  slaSummaryCacheKey,
  writeReportSummaryCache,
  type ReportSummaryCacheClient,
} from './summary/report-summary-cache';
import {
  parseDashboardSummaryResponse,
  parseSlaSummaryResponse,
} from './summary/parse-report-summary-cache';
import type {
  DashboardSummaryResponse,
  DashboardSummaryScope,
  SlaSummaryResponse,
} from './summary/report-summary.types';

/**
 * The Redis client of the report summaries, wrapped so the callers never have to
 * think about Redis being down: every method degrades to "no cache" and the
 * service falls back to the aggregate queries (plan §2.4).
 */
@Injectable()
export class ReportSummaryCache {
  constructor(@Inject(redisTokens.client) private readonly redis: Redis) {}

  async readDashboardSummary(
    userId: string,
    scope: DashboardSummaryScope,
    timeZone: string,
  ): Promise<DashboardSummaryResponse | null> {
    return readReportSummaryCache(
      await this.client(),
      dashboardSummaryCacheKey(userId, scope, timeZone),
      parseDashboardSummaryResponse,
    );
  }

  async writeDashboardSummary(
    userId: string,
    summary: DashboardSummaryResponse,
    timeZone: string,
  ): Promise<void> {
    await writeReportSummaryCache(
      await this.client(),
      dashboardSummaryCacheKey(userId, summary.scope, timeZone),
      summary,
    );
  }

  async readSlaSummary(userId: string): Promise<SlaSummaryResponse | null> {
    return readReportSummaryCache(
      await this.client(),
      slaSummaryCacheKey(userId),
      parseSlaSummaryResponse,
    );
  }

  async writeSlaSummary(userId: string, summary: SlaSummaryResponse): Promise<void> {
    await writeReportSummaryCache(
      await this.client(),
      slaSummaryCacheKey(userId),
      summary,
    );
  }

  private async client(): Promise<ReportSummaryCacheClient | null> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis as unknown as ReportSummaryCacheClient;
    } catch {
      return null;
    }
  }
}
