import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { OrganizationalUnitError } from '../organizational-units/organizational-unit.error';
import { mapOrganizationalUnitError } from '../organizational-units/map-organizational-unit-error';
import { RoutingError } from '../routing/routing.error';
import { mapRoutingError } from '../routing/map-routing-error';
import { ServiceCatalogError } from '../service-catalog/service-catalog.error';
import { mapServiceCatalogError } from '../service-catalog/map-service-catalog-error';
import { installSeedErrorCodes } from './install-seed.constants';
import { InstallSeedError } from './install-seed.error';
import type { InstallSeedErrorCode } from './install-seed.error';

const messages: Record<InstallSeedErrorCode, string> = {
  SUPER_ADMIN_REQUIRED: 'Initial SuperAdmin must exist before seed',
  SEED_ROUTING_UNRESOLVED:
    'Seeded origin unit and service did not resolve to the fallback group',
};

export function mapInstallSeedError(error: unknown): HttpException {
  if (error instanceof OrganizationalUnitError) {
    return mapOrganizationalUnitError(error);
  }
  if (error instanceof ServiceCatalogError) {
    return mapServiceCatalogError(error);
  }
  if (error instanceof RoutingError) {
    return mapRoutingError(error);
  }
  if (!(error instanceof InstallSeedError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === installSeedErrorCodes.superAdminRequired) {
    return new ConflictException(body);
  }
  return new InternalServerErrorException(body);
}
