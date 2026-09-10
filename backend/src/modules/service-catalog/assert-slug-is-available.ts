import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';

export async function assertServiceSlugIsAvailable(
  prisma: PrismaService,
  slug: string,
  currentServiceId?: string,
): Promise<void> {
  const existing = await prisma.service.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing === null || existing.id === currentServiceId) {
    return;
  }
  throw new ServiceCatalogError('DUPLICATE_SLUG');
}

export async function assertServiceCategorySlugIsAvailable(
  prisma: PrismaService,
  slug: string,
  currentCategoryId?: string,
): Promise<void> {
  const existing = await prisma.serviceCategory.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing === null || existing.id === currentCategoryId) {
    return;
  }
  throw new ServiceCatalogError('DUPLICATE_SLUG');
}
