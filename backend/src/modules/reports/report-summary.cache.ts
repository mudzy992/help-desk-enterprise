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
    authzVersion: number,
    timeZone: string,
  ): Promise<DashboardSummaryResponse | null> {
    return readReportSummaryCache(
      await this.client(),
      dashboardSummaryCacheKey(userId, authzVersion, timeZone),
      parseDashboardSummaryResponse,
    );
  }

  async writeDashboardSummary(
    userId: string,
    authzVersion: number,
    summary: DashboardSummaryResponse,
    timeZone: string,
  ): Promise<void> {
    await writeReportSummaryCache(
      await this.client(),
      dashboardSummaryCacheKey(userId, authzVersion, timeZone),
      summary,
    );
  }

  async readSlaSummary(
    userId: string,
    authzVersion: number,
  ): Promise<SlaSummaryResponse | null> {
    return readReportSummaryCache(
      await this.client(),
      slaSummaryCacheKey(userId, authzVersion),
      parseSlaSummaryResponse,
    );
  }

  async writeSlaSummary(
    userId: string,
    authzVersion: number,
    summary: SlaSummaryResponse,
  ): Promise<void> {
    await writeReportSummaryCache(
      await this.client(),
      slaSummaryCacheKey(userId, authzVersion),
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
