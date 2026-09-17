import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { fanOutInAppNotifications } from './fan-out-in-app-notifications';

type SlaRuntimeNotificationChannels = {
  readonly publish: (
    payload: TicketRealtimeMessagePayload,
  ) => void | Promise<void>;
};

let registeredChannels: SlaRuntimeNotificationChannels | null = null;

export function registerSlaRuntimeNotificationChannels(
  channels: SlaRuntimeNotificationChannels,
): void {
  registeredChannels = channels;
}

export function clearSlaRuntimeNotificationChannels(): void {
  registeredChannels = null;
}

export async function dispatchSlaRuntimeNotification(
  prisma: PrismaService,
  payload: TicketRealtimeMessagePayload,
): Promise<void> {
  if (registeredChannels !== null) {
    await registeredChannels.publish(payload);
    return;
  }
  await fanOutInAppNotifications(prisma, payload);
}
