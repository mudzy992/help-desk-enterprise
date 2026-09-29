import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { flushKnowledgeArticleViews } from './knowledge-article-views';

/**
 * Paket 2.9 (K1b): writes finished days of Redis view counters to the
 * database. Runs inside the knowledge-base review-reminder job (every 15 min),
 * so no extra queue is needed. Without Redis the views were written directly.
 */
@Injectable()
export class KnowledgeViewFlushService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async flush(now: Date = new Date()): Promise<number> {
    const redis = this.redisService?.getClient();
    if (redis === undefined) {
      return 0;
    }
    return flushKnowledgeArticleViews({ prisma: this.prisma, redis, now });
  }
}
