import { Controller, Get, HttpException, HttpStatus, Inject, Optional, Req, Res } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import { brandingLimits } from './branding.constants';
import { BrandingService, type Branding } from './branding.service';

type PublicRequest = { readonly ip?: string };
type HeaderResponse = { setHeader(name: string, value: string): void };

/**
 * Paket 4.1 (§3a): the login page, favicon and document title need branding
 * before anyone signs in, so this endpoint is public. It exposes only the
 * public.branding.* values (read through the settings snapshot cache, so a
 * saved change is visible at once), lets browsers cache it for 60 s and is
 * rate limited per IP (fails open - the snapshot bounds database load).
 */
@Controller('branding')
export class PublicBrandingController {
  private readonly memoryHits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly branding: BrandingService,
    @Optional() @Inject(redisTokens.client) private readonly redis?: Redis,
  ) {}

  @Get()
  async get(@Req() request: PublicRequest, @Res({ passthrough: true }) response: HeaderResponse): Promise<Branding> {
    await this.limit(request.ip ?? 'unknown');
    const body = await this.branding.load();
    response.setHeader('Cache-Control', `public, max-age=${brandingLimits.publicCacheSeconds}`);
    return body;
  }

  private async limit(ip: string): Promise<void> {
    const windowSeconds = 60;
    let count: number;
    if (this.redis !== undefined) {
      try {
        const key = `branding:public-rate:${ip}`;
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
    if (count > brandingLimits.publicRequestsPerMinute) {
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests' }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
