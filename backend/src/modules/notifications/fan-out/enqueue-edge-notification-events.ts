import { PrismaService } from '../../../common/prisma/prisma.service';
import { IntegrationJobType } from '../../../generated/prisma/enums';
import { EnqueueIntegrationJobService } from '../../integration-queue/enqueue-integration-job.service';
import { isQueuedIntegrationJobType } from '../../integration-queue/parse-integration-queue-types';
import { loadIntegrationQueueSettings } from '../../integration-queue/load-integration-queue-settings';
import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { ticketRealtimeEventNames } from '../../tickets/collaboration.constants';
import { countUnreadNotifications } from '../count-unread-notifications';
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
  for (const record of input.records) {
    const unreadCount = await countUnreadNotifications(
      input.prisma,
      record.userId,
    );
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
