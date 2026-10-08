import { PrismaService } from '../../common/prisma/prisma.service';
import type { ServiceCategoryLabel } from './service-catalog.types';

/**
 * Paket 5.3.1: the create-ticket service step groups services by category.
 * Requesters cannot read `/service-categories` (admin route), so the list of
 * services carries the category's display name and sort order — nothing else
 * about the category leaks.
 */
export async function loadServiceCategoryLabels(
  prisma: PrismaService,
  categoryIds: readonly string[],
): Promise<ReadonlyMap<string, ServiceCategoryLabel>> {
  const wanted = new Set(categoryIds);
  if (wanted.size === 0) {
    return new Map();
  }
  const rows = (await prisma.serviceCategory.findMany({
    where: { id: { in: [...wanted] } },
    select: { id: true, name: true, sortOrder: true },
  })) as readonly { id: string; name: string; sortOrder: number }[];
  return new Map(
    rows
      .filter((row) => wanted.has(row.id))
      .map((row) => [row.id, { name: row.name, sortOrder: row.sortOrder }]),
  );
}
