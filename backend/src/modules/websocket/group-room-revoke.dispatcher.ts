import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { redisTokens } from '../../common/redis/redis.tokens';
import {
  publishSocketSessionInvalidation,
  type SocketSessionInvalidationPublisher,
} from '../../common/security/socket-session-invalidation';
import {
  readGroupRoomRevokePayload,
  groupRoomRevokeTopic,
} from '../groups/group-room-revoke.outbox';

const dispatchIntervalMs = 2_000;
const dispatchBatchSize = 25;

/**
 * W2.25 (`BA-groups-02`): the publisher half of the durable group-room revoke.
 *
 * `removeGroupMember` writes the intent into the outbox inside its transaction; this
 * service turns it into a cross-instance socket event on every API instance. It is a
 * normal outbox consumer, so a Redis outage is a **retry**, not a lost revoke:
 *
 *   commit membership + intent → claim → publish → `SUCCEEDED`
 *                                  ↘ publish fails → backoff → retry (≤ 20 attempts)
 *                                                        ↘ dead letter + warning line
 *
 * The 30-second room sweep in `socket-room-revalidation.ts` remains the safety net
 * for anything the channel misses; nothing here is the only thing keeping a revoked
 * member out of a room.
 */
@Injectable()
export class GroupRoomRevokeDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupRoomRevokeDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(
    private readonly outbox: TransactionalOutboxService,
    @Optional()
    @Inject(redisTokens.client)
    private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(`group_room_revoke_drain_failed reason=${describeError(error)}`);
      });
    }, dispatchIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  /** Publishes pending revokes; tests call it directly instead of waiting for the timer. */
  async drain(limit = dispatchBatchSize): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let published = 0;
    try {
      for (let index = 0; index < Math.max(1, limit); index += 1) {
        const result = await this.outbox.dispatchOne(groupRoomRevokeTopic, async (delivery) => {
          const event = readGroupRoomRevokePayload(delivery.payload);
          const sent = await publishSocketSessionInvalidation(this.publisher(), {
            version: 1,
            kind: 'group',
            subjectId: event.subjectId,
            groupId: event.groupId,
          });
          // No publisher (single-instance deployment without Redis) is not a fault:
          // that instance owns every socket, and its own sweep still applies.
          if (!sent && this.redis !== undefined) {
            throw new Error('group_room_revoke_publish_failed');
          }
        });
        if (result === 'idle') break;
        if (result === 'succeeded') {
          published += 1;
          continue;
        }
        if (result === 'dead-letter') {
          this.logger.warn(
            'group_room_revoke_dead_letter topic=groups.membership-revoke sweep_fallback=1',
          );
        }
      }
      return published;
    } finally {
      this.draining = false;
    }
  }

  private publisher(): SocketSessionInvalidationPublisher | undefined {
    return this.redis === undefined ? undefined : this.redis;
  }
}

function describeError(error: unknown): string {
  const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return value.slice(0, 300);
}
