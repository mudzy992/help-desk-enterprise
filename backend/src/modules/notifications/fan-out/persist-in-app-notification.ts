import { PrismaService } from '../../../common/prisma/prisma.service';
import type { NotificationPayload, NotificationRecord } from '../notifications.types';
import type { NotificationType } from '../notifications.constants';
import type { NotificationPreferencePolicy } from '../preferences/notification-preference-policy';
import { resolveDeliveryDecisions } from '../preferences/resolve-delivery-decisions';

export async function persistInAppNotification(
  prisma: PrismaService,
  input: {
    readonly userId: string;
    readonly type: NotificationType;
    readonly title: string;
    readonly body: string | null;
    readonly ticketId: string | null;
    readonly payload: NotificationPayload;
    readonly dedupeKey: string;
  },
  /** Paket 2.2: honour the recipient's in-app choice (security types always pass). */
  policy?: NotificationPreferencePolicy,
): Promise<NotificationRecord | null> {
  if (policy !== undefined) {
    const decision = (
      await resolveDeliveryDecisions(prisma, policy, { type: input.type, userIds: [input.userId] })
    ).get(input.userId);
    if (decision?.inApp === false) {
      return null;
    }
  }
  try {
    return (await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        ticketId: input.ticketId,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
      },
    })) as NotificationRecord;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return null;
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
