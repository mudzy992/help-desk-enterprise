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

  // M7 B5 (val 5): `private.ticket.priorityMatrix.enabled` = false.
  it('skips the table entirely when the matrix is switched off', async () => {
    const findUnique = jest.fn(async () => ({ priority: 'CRITICAL' as const }));
    const prisma = { priorityMatrixRule: { findUnique } };
    await expect(
      resolveTicketPriority(prisma as never, 'HIGH', 'HIGH', {
        matrixEnabled: false,
      }),
    ).resolves.toBe('HIGH');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('still reads the table when the switch is on or unset', async () => {
    const findUnique = jest.fn(async () => ({ priority: 'CRITICAL' as const }));
    const prisma = { priorityMatrixRule: { findUnique } };
    await expect(
      resolveTicketPriority(prisma as never, 'HIGH', 'HIGH', {
        matrixEnabled: true,
      }),
    ).resolves.toBe('CRITICAL');
    await expect(
      resolveTicketPriority(prisma as never, 'HIGH', 'HIGH'),
    ).resolves.toBe('CRITICAL');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
