import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import {
  flushKnowledgeArticleViews,
  inspectKnowledgeViewBacklog,
  type KnowledgeViewBacklog,
} from './knowledge-article-views';

/**
 * Paket 2.9 (K1b): writes finished days of Redis view counters to the
 * database. Runs inside the knowledge-base review-reminder job (every 15 min),
 * so no extra queue is needed. Without Redis the views were written directly.
 *
 * W7.86 (`BA-knowledge-base-13`): the flush also reports how far behind it is.
 * Without that number the sweep could not say whether it drained everything or
 * whether days were piling up toward the 8-day key TTL.
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

  /** `null` when this process has no Redis client (nothing is buffered then). */
  async backlog(now: Date = new Date()): Promise<KnowledgeViewBacklog | null> {
    const redis = this.redisService?.getClient();
    if (redis === undefined) {
      return null;
    }
    return inspectKnowledgeViewBacklog({ redis, now });
  }
}
