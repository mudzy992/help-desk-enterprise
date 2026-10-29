import { Controller, Get, HttpException, HttpStatus, Inject, NotFoundException, Optional, Query, Req, Res } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import { anonymousViewer, StatusPageService, type IncidentView, type StatusPageView } from './status-page.service';
import { statusPageLimits } from './status-page.model';
import { StatusPagePublicCacheService } from './status-page-public-cache.service';
import { IncidentListQueryDto } from './status-page.dto';

type PublicRequest = { readonly ip?: string; readonly socket?: { readonly remoteAddress?: string | null } };
type HeaderResponse = { setHeader(name: string, value: string): void };

/**
 * Paket 2.7 (§8.1, §15 odluka 5): the public status page - only when
 * `private.statusPage.public` is on (default off). No STAFF_ONLY incidents,
 * no author names, no counters. Shared Redis cache across API instances with
 * a version key bumped on every incident mutation, and a per-IP rate limit
 * that fails closed when Redis is unavailable.
 */
@Controller('public/status')
export class PublicStatusPageController {
  private memoryHits?: Map<string, { count: number; resetAt: number }>;

  constructor(
    private readonly page: StatusPageService,
    private readonly cache: StatusPagePublicCacheService,
    @Optional() @Inject(redisTokens.client) private readonly redis?: Redis,
  ) {}

  @Get()
  async overview(
    @Req() request: PublicRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
    @Query() activeQuery: IncidentListQueryDto,
    @Query() historyQuery: IncidentListQueryDto,
  ): Promise<PublicStatusPage> {
    const ip = this.clientIp(request);
    await this.limit(ip);
    const configuration = await this.page.loadConfiguration();
    if (!configuration.enabled || !configuration.public) {
      response.setHeader('Cache-Control', 'no-store');
      throw new NotFoundException({ code: 'STATUS_PAGE_NOT_PUBLIC', message: 'The status page is not public' });
    }

    const version = await this.cache.getVersion();
    const cached = await this.cache.getPage(version);
    if (cached !== null) {
      response.setHeader('Cache-Control', `public, max-age=${statusPageLimits.publicCacheMs / 1000}`);
      return JSON.parse(cached) as PublicStatusPage;
    }

    const body = toPublicStatusPage(await this.page.page(anonymousViewer, new Date(), activeQuery, historyQuery));
    await this.cache.setPage(version, JSON.stringify(body));
    response.setHeader('Cache-Control', `public, max-age=${statusPageLimits.publicCacheMs / 1000}`);
    return body;
  }

  /** Trust-proxy-aware client IP. Falls back to the connection remote address. */
  private clientIp(request: PublicRequest): string {
    if (request.ip && request.ip !== 'unknown' && request.ip !== '::1' && request.ip !== '127.0.0.1') {
      return request.ip;
    }
    return request.socket?.remoteAddress ?? 'unknown';
  }

  private async limit(ip: string): Promise<void> {
    const windowSeconds = 60;
    let count: number;
    if (this.redis !== undefined) {
      try {
        const key = `status:public-rate:${ip}`;
        count = await this.redis.incr(key);
        if (count === 1) await this.redis.expire(key, windowSeconds);
      } catch {
        // Redis down: fail closed - reject the request instead of allowing
        // unbounded access through a broken limiter.
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'Too many requests' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } else {
      // Memory fallback (single instance, no Redis): bounded map, same window.
      if (!this.memoryHits) {
        this.memoryHits = new Map<string, { count: number; resetAt: number }>();
      }
      const now = Date.now();
      const entry = this.memoryHits.get(ip);
      if (entry === undefined || entry.resetAt <= now) {
        if (this.memoryHits.size > 10_000) this.memoryHits.clear();
        this.memoryHits.set(ip, { count: 1, resetAt: now + windowSeconds * 1000 });
        count = 1;
      } else {
        entry.count += 1;
        count = entry.count;
      }
    }
    if (count > statusPageLimits.publicRequestsPerMinute) {
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests' }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

export type PublicStatusPage = Omit<StatusPageView, 'canManage' | 'configuration'> & {
  readonly configuration: { readonly historyDays: number; readonly showUptimePercent: boolean };
};

/** Strips everything that is not meant for anonymous readers, even if the query changes later. */
export function toPublicStatusPage(view: StatusPageView): PublicStatusPage {
  const clean = (incident: IncidentView): IncidentView => ({
    id: incident.id,
    title: incident.title,
    titleEn: incident.titleEn,
    impact: incident.impact,
    status: incident.status,
    visibility: incident.visibility,
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
    revision: incident.revision,
    services: incident.services.map((service) => ({ id: service.id, name: service.name })),
    updates: incident.updates.map((update) => ({
      id: update.id,
      status: update.status,
      message: update.message,
      createdAt: update.createdAt,
      authorName: null,
    })),
    updatesHasMore: incident.updatesHasMore,
    updatesNextCursor: incident.updatesNextCursor,
    linkedTicketCount: null,
    subscriberCount: null,
    subscribed: false,
  });
  return {
    generatedAt: view.generatedAt,
    configuration: { historyDays: view.configuration.historyDays, showUptimePercent: view.configuration.showUptimePercent },
    affectedServiceCount: view.affectedServiceCount,
    servicesHasMore: view.servicesHasMore,
    plannedHasMore: view.plannedHasMore,
    categories: view.categories,
    activeIncidents: view.activeIncidents.filter((incident) => incident.visibility === 'ALL_USERS').map(clean),
    planned: view.planned,
    history: view.history.filter((incident) => incident.visibility === 'ALL_USERS').map(clean),
  };
}
