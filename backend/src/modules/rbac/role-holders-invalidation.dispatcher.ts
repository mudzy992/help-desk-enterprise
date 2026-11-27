import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { CacheInvalidationService } from '../../common/cache-invalidation/cache-invalidation.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { roleHoldersInvalidationNamespace } from './role-holders-invalidation';

const drainIntervalMs = 3_000;
const maxDispatchPerTick = 25;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/**
 * W2.32 (`BA-rbac-05`): delivers the role-holder invalidations the role write
 * committed to the outbox.
 *
 * A failed delivery throws, so the outbox keeps the retry/dead-letter state and
 * the API never claims a cache was dropped when it was not. Nothing here is
 * required for correctness: the `authzVersion` the write bumped already makes
 * the cached payload unreachable, and this dispatcher only turns that guaranteed
 * miss into a guarantee that the next request does not have to read the whole
 * principal context out of PostgreSQL again.
 */
@Injectable()
export class RoleHoldersInvalidationDispatcher
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(RoleHoldersInvalidationDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly invalidator: PrincipalContextInvalidator,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(
          `authz_role_invalidation_drain_failed reason=${errorText(error)}`,
        );
      });
    }, drainIntervalMs);
    this.timer.unref?.();
    void this.drain().catch((error: unknown) => {
      this.logger.warn(
        `authz_role_invalidation_drain_failed reason=${errorText(error)}`,
      );
    });
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let index = 0; index < maxDispatchPerTick; index += 1) {
        const result = await this.dispatchOne();
        if (result === 'idle') break;
      }
    } finally {
      this.draining = false;
    }
  }

  /** One message per role; exported for the integration spec and the tests. */
  async dispatchOne(): Promise<'idle' | 'succeeded' | 'retry' | 'dead-letter'> {
    return this.cacheInvalidation.dispatchOne(
      roleHoldersInvalidationNamespace,
      async (event) => {
        // The holders and their committed versions are read at delivery time:
        // the message stays small, and a retry after a later role edit still
        // publishes the versions the database actually holds.
        const holders = await this.invalidator.roleHolderVersions(event.key);
        if (holders.length === 0) {
          return;
        }
        await this.invalidator.publishCommittedRoleHolders(
          event.key,
          holders,
        );
        this.logger.log(
          `authz_role_invalidation_published role=${event.key} users=${holders.length} revision=${event.revision}`,
        );
      },
    );
  }
}
