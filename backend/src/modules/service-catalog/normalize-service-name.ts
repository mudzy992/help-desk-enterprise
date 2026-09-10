import { serviceCatalogConstants } from './service-catalog.constants';
import { ServiceCatalogError } from './service-catalog.error';

export function normalizeServiceName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length === 0 ||
    normalized.length > serviceCatalogConstants.maximumNameLength
  ) {
    throw new ServiceCatalogError('INVALID_NAME');
  }
  return normalized;
}
