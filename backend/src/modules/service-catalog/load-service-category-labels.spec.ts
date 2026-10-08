import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadServiceCategoryLabels } from './load-service-category-labels';

describe('loadServiceCategoryLabels (5.3.1)', () => {
  it('returns only name and sort order of the requested categories', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'c1', name: 'IT podrška', sortOrder: 2 },
      { id: 'other', name: 'Ne traži se', sortOrder: 0 },
    ]);
    const prisma = { serviceCategory: { findMany } } as unknown as PrismaService;
    const labels = await loadServiceCategoryLabels(prisma, ['c1', 'c1']);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1'] } },
      select: { id: true, name: true, sortOrder: true },
    });
    expect([...labels.entries()]).toEqual([['c1', { name: 'IT podrška', sortOrder: 2 }]]);
  });

  it('skips the query when there are no services', async () => {
    const findMany = jest.fn();
    const prisma = { serviceCategory: { findMany } } as unknown as PrismaService;
    expect((await loadServiceCategoryLabels(prisma, [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
