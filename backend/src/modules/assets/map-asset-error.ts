import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssetError, assetErrorCodes } from './assets.constants';

/** Paket 3.2: domain errors -> HTTP. "Module off" is 404 (§2: as if it did not exist). */
export function mapAssetError(error: unknown): unknown {
  if (!(error instanceof AssetError)) return error;
  const body = { code: error.code, message: error.detail ?? error.code, detail: error.detail ?? null };
  switch (error.code) {
    case assetErrorCodes.disabled:
    case assetErrorCodes.notFound:
    case assetErrorCodes.typeNotFound:
    case assetErrorCodes.locationNotFound:
    case assetErrorCodes.unitNotFound:
    case assetErrorCodes.userNotFound:
    case assetErrorCodes.serviceNotFound:
    case assetErrorCodes.licenseNotFound:
    case assetErrorCodes.contractNotFound:
    case assetErrorCodes.importNotFound:
      return new NotFoundException(body);
    case assetErrorCodes.forbidden:
    case assetErrorCodes.outOfScope:
      return new ForbiddenException(body);
    case assetErrorCodes.tagTaken:
    case assetErrorCodes.statusTransition:
    case assetErrorCodes.versionConflict:
    case assetErrorCodes.readOnly:
    case assetErrorCodes.attributeNotUnique:
    case assetErrorCodes.typeKeyTaken:
    case assetErrorCodes.typeArchived:
    case assetErrorCodes.attributeKeyTaken:
    case assetErrorCodes.attributeHasValues:
    case assetErrorCodes.locationCodeTaken:
    case assetErrorCodes.locationInUse:
    case assetErrorCodes.relationExists:
    case assetErrorCodes.relationCycle:
    case assetErrorCodes.hasDependents:
    case assetErrorCodes.licenseAssignmentExists:
    case assetErrorCodes.contractItemExists:
    case assetErrorCodes.licenseKeyUnavailable:
    case assetErrorCodes.importExpired:
    case assetErrorCodes.importNotPending:
    case assetErrorCodes.importHasErrors:
    case assetErrorCodes.directorySyncDisabled:
    case assetErrorCodes.directoryNotConfigured:
      return new ConflictException(body);
    case assetErrorCodes.importFileTooLarge:
    case assetErrorCodes.exportTooLarge:
      return new PayloadTooLargeException(body);
    case assetErrorCodes.directoryUnavailable:
      return new ServiceUnavailableException(body);
    default:
      return new BadRequestException(body);
  }
}

export async function runAsset<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapAssetError(error);
    if (mapped instanceof HttpException) throw mapped;
    throw error;
  }
}
