import { resolveSlaComplianceUnitScope } from './resolve-sla-compliance-unit-scope';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('resolveSlaComplianceUnitScope', () => {
  it('includes the selected OU and descendants, but excludes sibling branches', async () => {
    const prisma = {
      organizationalUnit: {
        findMany: jest.fn(async () => [
          { id: 'root', ouPath: '/root' },
          { id: 'child', ouPath: '/root/child' },
          { id: 'grandchild', ouPath: '/root/child/grandchild' },
          { id: 'sibling', ouPath: '/sibling' },
        ]),
      },
    };

    await expect(
      resolveSlaComplianceUnitScope(prisma as never, 'child'),
    ).resolves.toEqual(['child', 'grandchild']);
  });

  it('returns an empty scope for an unknown unit', async () => {
    const prisma = {
      organizationalUnit: { findMany: jest.fn(async () => []) },
    };
    await expect(
      resolveSlaComplianceUnitScope(prisma as never, 'missing'),
    ).resolves.toEqual([]);
  });
});
