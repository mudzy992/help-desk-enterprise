import { PrismaService } from '../../../common/prisma/prisma.service';
import { emailDeliveryStatuses } from './email-template.constants';

export async function claimNotificationEmailDelivery(
  prisma: PrismaService,
  input: {
    readonly userId: string;
    readonly dedupeKey: string;
    readonly toAddress: string;
    readonly templateKey: string;
  },
): Promise<boolean> {
  try {
    await prisma.notificationEmailDelivery.create({
      data: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        toAddress: input.toAddress,
        templateKey: input.templateKey,
        status: emailDeliveryStatuses.claimed,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    throw error;
  }
}

export async function markNotificationEmailDeliverySent(
  prisma: PrismaService,
  input: { readonly userId: string; readonly dedupeKey: string },
): Promise<void> {
  await prisma.notificationEmailDelivery.updateMany({
    where: { userId: input.userId, dedupeKey: input.dedupeKey },
    data: { status: emailDeliveryStatuses.sent },
  });
}

export async function releaseNotificationEmailDeliveryClaim(
  prisma: PrismaService,
  input: { readonly userId: string; readonly dedupeKey: string },
): Promise<void> {
  await prisma.notificationEmailDelivery.deleteMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: emailDeliveryStatuses.claimed,
    },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
