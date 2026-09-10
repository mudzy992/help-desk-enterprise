import { serviceCatalogConstants } from './service-catalog.constants';
import { ServiceCatalogError } from './service-catalog.error';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeServiceSlug(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > serviceCatalogConstants.maximumSlugLength ||
    !slugPattern.test(normalized)
  ) {
    throw new ServiceCatalogError('INVALID_SLUG');
  }
  return normalized;
}
