import { Controller, Get, HttpException, HttpStatus, Inject, NotFoundException, Optional, Req, Res } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import { anonymousViewer, StatusPageService, type IncidentView, type StatusPageView } from './status-page.service';
import { statusPageLimits } from './status-page.model';

type PublicRequest = { readonly ip?: string };
type HeaderResponse = { setHeader(name: string, value: string): void };

/**
 * Paket 2.7 (§8.1, §15 odluka 5): the public status page - only when
 * `private.statusPage.public` is on (default off). No STAFF_ONLY incidents,
 * no author names, no counters. One cached answer per process (30 s) and a
 * per-IP limit keep an anonymous endpoint cheap; the limiter fails open
 * (the cache already bounds the database load).
 */
@Controller('public/status')
export class PublicStatusPageController {
  private cached: { readonly at: number; readonly body: PublicStatusPage } | null = null;
  private readonly memoryHits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly page: StatusPageService,
    @Optional() @Inject(redisTokens.client) private readonly redis?: Redis,
  ) {}

  @Get()
  async overview(@Req() request: PublicRequest, @Res({ passthrough: true }) response: HeaderResponse): Promise<PublicStatusPage> {
    await this.limit(request.ip ?? 'unknown');
    const configuration = await this.page.loadConfiguration();
    if (!configuration.enabled || !configuration.public) {
      response.setHeader('Cache-Control', 'no-store');
      throw new NotFoundException({ code: 'STATUS_PAGE_NOT_PUBLIC', message: 'The status page is not public' });
    }
    const now = Date.now();
    if (this.cached === null || now - this.cached.at >= statusPageLimits.publicCacheMs) {
      this.cached = { at: now, body: toPublicStatusPage(await this.page.page(anonymousViewer, new Date(now))) };
    }
    response.setHeader('Cache-Control', `public, max-age=${Math.floor(statusPageLimits.publicCacheMs / 1000)}`);
    return this.cached.body;
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
        return;
      }
    } else {
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
    ...incident,
    updates: incident.updates.map((update) => ({ ...update, authorName: null })),
    linkedTicketCount: null,
    subscriberCount: null,
    subscribed: false,
  });
  return {
    generatedAt: view.generatedAt,
    configuration: { historyDays: view.configuration.historyDays, showUptimePercent: view.configuration.showUptimePercent },
    affectedServiceCount: view.affectedServiceCount,
    categories: view.categories,
    activeIncidents: view.activeIncidents.filter((incident) => incident.visibility === 'ALL_USERS').map(clean),
    planned: view.planned,
    history: view.history.filter((incident) => incident.visibility === 'ALL_USERS').map(clean),
  };
}
