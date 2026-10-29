import { PrismaService } from '../../common/prisma/prisma.service';

export async function runCreateTicketTransaction<T>(
  prisma: PrismaService,
  operation: (transaction: PrismaService) => Promise<T>,
): Promise<T> {
  const candidate = prisma as PrismaService & { $transaction?: (callback: (transaction: PrismaService) => Promise<T>) => Promise<T> };
  return typeof candidate.$transaction === 'function'
    ? candidate.$transaction((transaction) => operation(transaction as PrismaService))
    : operation(prisma);
}
