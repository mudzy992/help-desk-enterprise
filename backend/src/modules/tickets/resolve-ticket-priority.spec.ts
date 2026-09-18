import { resolveTicketPriority } from './resolve-ticket-priority';

describe('resolveTicketPriority', () => {
  it('uses PriorityMatrixRule when present', async () => {
    const prisma = {
      priorityMatrixRule: {
        findUnique: async () => ({ priority: 'CRITICAL' as const }),
      },
    };
    await expect(
      resolveTicketPriority(prisma as never, 'HIGH', 'HIGH'),
    ).resolves.toBe('CRITICAL');
  });

  it('falls back to score bands when the cell is missing', async () => {
    const prisma = {
      priorityMatrixRule: {
        findUnique: async () => null,
      },
    };
    await expect(
      resolveTicketPriority(prisma as never, 'HIGH', 'HIGH'),
    ).resolves.toBe('HIGH');
  });
});
