import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { ServiceCatalogError } from '../../service-catalog/service-catalog.error';
import { installBlueprintErrorCodes } from './install-blueprint.constants';
import { InstallBlueprintError } from './install-blueprint.error';
import type { InstallBlueprintErrorCode } from './install-blueprint.error';

const messages: Record<InstallBlueprintErrorCode, string> = {
  BLUEPRINT_UNKNOWN: 'Unknown install blueprint',
  BLUEPRINT_SERVICE_UNKNOWN: 'Unknown request type of the install blueprint',
  BLUEPRINT_STRUCTURE_REQUIRED:
    'Run the structure step first: the catalog needs an organizational unit and a handler group',
  BLUEPRINT_ROUTING_UNRESOLVED:
    'A request type of the catalog has no routing rule to a handler group',
  SUPER_ADMIN_REQUIRED: 'Initial SuperAdmin must exist before the catalog step',
};

export function mapInstallBlueprintError(error: unknown): HttpException {
  if (error instanceof ServiceCatalogError) {
    return new BadRequestException({
      code: error.code,
      message: error.message,
    });
  }
  if (!(error instanceof InstallBlueprintError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (
    error.code === installBlueprintErrorCodes.superAdminRequired ||
    error.code === installBlueprintErrorCodes.structureRequired ||
    error.code === installBlueprintErrorCodes.routingUnresolved
  ) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
