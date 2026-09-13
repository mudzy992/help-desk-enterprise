import { PrismaService } from '../../../common/prisma/prisma.service';
import type { NotificationPayload } from '../notifications.types';
import type { NotificationType } from '../notifications.constants';

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
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        ticketId: input.ticketId,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return;
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
