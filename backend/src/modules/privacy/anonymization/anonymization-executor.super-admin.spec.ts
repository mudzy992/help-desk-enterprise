jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { anonymizationBlockReasons } from '../privacy.constants';
import { AnonymizationExecutor } from './anonymization-executor';

describe('AnonymizationExecutor SuperAdmin guard (M3 B5)', () => {
  it('fails before scrubbing or deleting any subject data when the target still has a SuperAdmin role', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: { findFirst: jest.fn().mockResolvedValue({ id: 'super-admin-role' }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
      $queryRaw: jest.fn(),
    };
    const executor = new AnonymizationExecutor(prisma as never, {} as never, {} as never);

    await expect(executor.execute({
      userId: 'last-admin',
      email: 'admin@example.test',
      replacement: 'Bivši korisnik #AB12',
      scrubber: {} as never,
      deleteOwnAttachments: false,
    })).rejects.toThrow(`blocked:${anonymizationBlockReasons.superAdmin}`);

    expect(transaction.userRole.findFirst).toHaveBeenCalledWith({
      where: { userId: 'last-admin', role: { key: 'SUPER_ADMIN' } },
      select: { id: true },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
