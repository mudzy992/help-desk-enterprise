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
import type { FannedOutNotifications } from './fan-out-in-app-notifications';
import { toNotificationRealtimeClientPayload } from '../to-notification-realtime-client-payload';
import { toNotificationResponse } from '../to-notification-response';

export async function enqueueEdgeNotificationEvents(input: {
  readonly prisma: PrismaService;
  readonly settingsService: SettingsService;
  readonly enqueueIntegrationJobService: EnqueueIntegrationJobService;
  readonly records: FannedOutNotifications;
}): Promise<void> {
  if (input.records.personal.length === 0 && input.records.group === null) {
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
  // The edge channel is per person, so a group row is expanded to its members here —
  // and only here: this branch runs only when the Edge add-on is switched on, which
  // keeps the member read (and the per-member badge) off the default fan-out path.
  const deliveries: { readonly userId: string; readonly record: NotificationRecord }[] =
    input.records.personal.flatMap((record) =>
      record.userId === null ? [] : [{ userId: record.userId, record }],
    );
  const group = input.records.group;
  if (group !== null && group.groupId) {
    const excluded = new Set(group.excludedUserIds ?? []);
    const members = await input.prisma.groupMember.findMany({
      where: { groupId: group.groupId },
      select: { userId: true },
    });
    for (const member of members) {
      if (!excluded.has(member.userId)) {
        deliveries.push({ userId: member.userId, record: group });
      }
    }
  }
  for (const delivery of deliveries) {
    const unreadCount = await countUnreadNotifications(input.prisma, delivery.userId);
    await input.enqueueIntegrationJobService.enqueue({
      type: IntegrationJobType.EDGE_EVENT,
      payload: {
        userId: delivery.userId,
        ticketId: delivery.record.ticketId ?? undefined,
        eventName: ticketRealtimeEventNames.notificationCreated,
        data: toNotificationRealtimeClientPayload({
          userId: delivery.userId,
          eventName: ticketRealtimeEventNames.notificationCreated,
          notification: toNotificationResponse(delivery.record),
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
