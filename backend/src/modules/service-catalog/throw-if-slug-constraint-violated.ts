import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';

type PrismaUniqueConstraintError = {
  readonly code: 'P2002';
};

export function throwIfSlugConstraintViolated(error: unknown): void {
  if (!isPrismaUniqueConstraintError(error)) {
    return;
  }
  throw new ServiceCatalogError('DUPLICATE_SLUG');
}

function isPrismaUniqueConstraintError(
  error: unknown,
): error is PrismaUniqueConstraintError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
