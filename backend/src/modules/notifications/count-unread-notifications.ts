import { PrismaService } from '../../common/prisma/prisma.service';

export async function countUnreadNotifications(
  prisma: PrismaService,
  userId: string,
): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}
