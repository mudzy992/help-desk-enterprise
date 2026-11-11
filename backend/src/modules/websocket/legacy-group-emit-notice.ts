import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isLegacyGroupFullEmitEnabled } from './group-feed-change';

/**
 * Package 5.2.3 (M11 B4): while the legacy group-room full-payload emit is
 * enabled, log a clear startup warning so operators know the compatibility
 * flag is still on. The flag is explicitly set to `off` through
 * `WS_GROUP_FEED_LEGACY_FULL_EMIT=off` by the operator once all clients are
 * on the new light-event build; we never turn it off automatically based on
 * uptime (would silently drop updates for stale browser tabs).
 */
@Injectable()
export class LegacyGroupEmitNotice implements OnModuleInit {
  private readonly logger = new Logger(LegacyGroupEmitNotice.name);

  onModuleInit(): void {
    if (isLegacyGroupFullEmitEnabled()) {
      this.logger.warn(
        'WS_GROUP_FEED_LEGACY_FULL_EMIT is ON — group rooms receive the full '
          + 'ticket.updated payload in addition to the light group.feed-changed '
          + 'event. This is a rolling-deploy compatibility mode for pre-3.2 '
          + 'clients and roughly doubles group-room socket traffic. Once every '
          + 'connected client is on a build that consumes group.feed-changed, '
          + 'set WS_GROUP_FEED_LEGACY_FULL_EMIT=off and redeploy (see '
          + 'ops/ws-rolling-deploy.md).',
      );
    } else {
      this.logger.log(
        'WS_GROUP_FEED_LEGACY_FULL_EMIT is OFF — group rooms receive only the '
          + 'light group.feed-changed event.',
      );
    }
  }
}
