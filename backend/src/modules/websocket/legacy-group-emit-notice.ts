import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isLegacyGroupFullEmitEnabled } from './group-feed-change';

/**
 * Emit a startup warning when the temporary full-payload group compatibility
 * mode is explicitly enabled. Unset is the secure default; no automatic
 * timeout is used because legacy browser tabs may remain connected.
 */
@Injectable()
export class LegacyGroupEmitNotice implements OnModuleInit {
  private readonly logger = new Logger(LegacyGroupEmitNotice.name);

  onModuleInit(): void {
    if (isLegacyGroupFullEmitEnabled()) {
      this.logger.warn(
        'WS_GROUP_FEED_LEGACY_FULL_EMIT is explicitly ON — group rooms receive '
          + 'full public ticket/message payloads without per-ticket authorization. '
          + 'Use only as temporary, reviewed compatibility for old clients, then '
          + 'unset or set the flag to off and redeploy (see ops/ws-rolling-deploy.md).',
      );
    } else {
      this.logger.log(
        'WS_GROUP_FEED_LEGACY_FULL_EMIT is OFF (default) — group rooms receive '
          + 'only the light group.feed-changed event.',
      );
    }
  }
}
