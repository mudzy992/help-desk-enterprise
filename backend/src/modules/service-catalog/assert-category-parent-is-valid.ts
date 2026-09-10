import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';

export async function assertCategoryParentIsValid(
  prisma: PrismaService,
  input: {
    readonly categoryId?: string;
    readonly parentId: string | null;
  },
): Promise<void> {
  if (input.parentId === null) {
    return;
  }
  if (input.categoryId !== undefined && input.parentId === input.categoryId) {
    throw new ServiceCatalogError('SELF_PARENT_CATEGORY');
  }
  const parent = await prisma.serviceCategory.findUnique({
    where: { id: input.parentId },
    select: { id: true, parentId: true },
  });
  if (parent === null) {
    throw new ServiceCatalogError('INVALID_PARENT_CATEGORY');
  }
  if (input.categoryId === undefined) {
    return;
  }
  let cursor: string | null = parent.parentId;
  const visited = new Set<string>([input.categoryId, input.parentId]);
  while (cursor !== null) {
    if (visited.has(cursor)) {
      throw new ServiceCatalogError('CIRCULAR_CATEGORY');
    }
    visited.add(cursor);
    const ancestor: { parentId: string | null } | null =
      await prisma.serviceCategory.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    cursor = ancestor?.parentId ?? null;
  }
}
