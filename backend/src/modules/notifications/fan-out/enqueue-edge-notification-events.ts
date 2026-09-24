import { PrismaService } from '../../../common/prisma/prisma.service';
import { IntegrationJobType } from '../../../generated/prisma/enums';
import { EnqueueIntegrationJobService } from '../../integration-queue/enqueue-integration-job.service';
import { isQueuedIntegrationJobType } from '../../integration-queue/parse-integration-queue-types';
import { loadIntegrationQueueSettings } from '../../integration-queue/load-integration-queue-settings';
import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { ticketRealtimeEventNames } from '../../tickets/collaboration.constants';
import { loadUnreadCountsForUsers } from '../load-unread-counts-for-users';
import type { NotificationRecord } from '../notifications.types';
import { toNotificationRealtimeClientPayload } from '../to-notification-realtime-client-payload';
import { toNotificationResponse } from '../to-notification-response';

export async function enqueueEdgeNotificationEvents(input: {
  readonly prisma: PrismaService;
  readonly settingsService: SettingsService;
  readonly enqueueIntegrationJobService: EnqueueIntegrationJobService;
  readonly records: readonly NotificationRecord[];
}): Promise<void> {
  if (input.records.length === 0) {
    return;
  }
  if (!(await isEdgeEventDeliveryEnabled(input.settingsService))) {
    return;
  }
  const queue = await loadIntegrationQueueSettings(input.settingsService);
  if (
    !queue.enabled ||
    !isQueuedIntegrationJobType(IntegrationJobType.EDGE_EVENT, queue.typeTokens)
  ) {
    return;
  }
  // Phase 2.3 (plan §2.3): the badge of every recipient in one query.
  const unreadCounts = await loadUnreadCountsForUsers(
    input.prisma,
    input.records.map((record) => record.userId),
  );
  for (const record of input.records) {
    const unreadCount = unreadCounts.get(record.userId) ?? 0;
    await input.enqueueIntegrationJobService.enqueue({
      type: IntegrationJobType.EDGE_EVENT,
      payload: {
        userId: record.userId,
        ticketId: record.ticketId ?? undefined,
        eventName: ticketRealtimeEventNames.notificationCreated,
        data: toNotificationRealtimeClientPayload({
          userId: record.userId,
          eventName: ticketRealtimeEventNames.notificationCreated,
          notification: toNotificationResponse(record),
          unreadCount,
        }),
      },
    });
  }
}

async function isEdgeEventDeliveryEnabled(
  settingsService: SettingsService,
): Promise<boolean> {
  const addonOn =
    (await settingsService.getSetting(settingKeys.privateAddonsEdge)) === true;
  const moduleOn =
    (await settingsService.getSetting(settingKeys.privateEdgeExtensionEnabled)) !==
    false;
  const channelOn =
    (await settingsService.getSetting(
      settingKeys.privateNotificationsEdgeEnabled,
    )) !== false;
  return addonOn && moduleOn && channelOn;
}
