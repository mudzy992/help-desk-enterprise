import { resolveSlaComplianceUnitScope } from './resolve-sla-compliance-unit-scope';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('resolveSlaComplianceUnitScope', () => {
  it('queries only the selected OU subtree and excludes sibling branches at DB level', async () => {
    const findUnique = jest.fn(async () => ({ ouPath: '/root/child' }));
    const findMany = jest.fn(async () => [{ id: 'child' }, { id: 'grandchild' }]);
    const prisma = { organizationalUnit: { findUnique, findMany } };
    await expect(resolveSlaComplianceUnitScope(prisma as never, 'child')).resolves.toEqual(['child', 'grandchild']);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'child' }, select: { ouPath: true } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ id: 'child' }, { ouPath: { startsWith: '/root/child/' } }] },
      select: { id: true },
    }));
  });

  it('returns an empty scope without a descendant query for an unknown unit', async () => {
    const findMany = jest.fn();
    const prisma = { organizationalUnit: { findUnique: jest.fn(async () => null), findMany } };
    await expect(resolveSlaComplianceUnitScope(prisma as never, 'missing')).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
