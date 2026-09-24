import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';
import {
  readTicketLabels,
  writeTicketLabels,
  type TicketLabelCache,
  type TicketLabelCacheClient,
  type TicketLabelCacheEntry,
  type TicketLabelKind,
  type TicketLabelRow,
} from './ticket-label-cache';

/**
 * The Redis client of the ticket display labels, wrapped so the callers never
 * have to think about Redis being down: every method degrades to "no cache" and
 * `loadTicketDisplayLabels` reads the database (same contract as
 * `ReportSummaryCache` and `PrincipalContextLoader`).
 */
@Injectable()
export class TicketLabelCacheService implements TicketLabelCache {
  constructor(@Inject(redisTokens.client) private readonly redis: Redis) {}

  async read(
    kind: TicketLabelKind,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, TicketLabelRow | null>> {
    return readTicketLabels(await this.client(), kind, ids);
  }

  async write(
    kind: TicketLabelKind,
    entries: readonly TicketLabelCacheEntry[],
  ): Promise<void> {
    await writeTicketLabels(await this.client(), kind, entries);
  }

  private async client(): Promise<TicketLabelCacheClient | null> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis as unknown as TicketLabelCacheClient;
    } catch {
      return null;
    }
  }
}
