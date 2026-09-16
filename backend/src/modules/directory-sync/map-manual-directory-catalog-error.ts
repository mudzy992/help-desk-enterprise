import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';

const conflictCodes = new Set([
  'HAS_CHILDREN',
  'HAS_MAPPED_USERS',
  'IDENTITY_CONFLICT',
]);

const messages: Record<string, string> = {
  NOT_FOUND: 'Manual directory organizational unit was not found',
  HAS_CHILDREN:
    'Brisanje OU se odbija dok postoje djeca ili mapirani korisnici',
  HAS_MAPPED_USERS:
    'Brisanje OU se odbija dok postoje djeca ili mapirani korisnici',
  PARENT_NOT_FOUND: 'Parent organizational unit was not found in the catalog',
  IDENTITY_CONFLICT: 'Distinguished name or path already exists in the catalog',
  INVALID_INPUT: 'Manual directory organizational unit input is invalid',
};

export function mapManualDirectoryCatalogError(error: unknown): never {
  if (!(error instanceof ManualDirectoryCatalogError)) {
    throw error;
  }
  const message = messages[error.code] ?? error.code;
  if (error.code === 'NOT_FOUND' || error.code === 'PARENT_NOT_FOUND') {
    throw new NotFoundException({ code: error.code, message });
  }
  if (conflictCodes.has(error.code)) {
    throw new ConflictException({ code: error.code, message });
  }
  throw new BadRequestException({ code: error.code, message });
}
