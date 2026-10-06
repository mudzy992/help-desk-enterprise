import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';

const conflictCodes = new Set([
  'HAS_CHILDREN',
  'HAS_MAPPED_USERS',
  'HAS_GROUPS',
  'IDENTITY_CONFLICT',
]);

const messages: Record<string, string> = {
  NOT_FOUND: 'Manual directory organizational unit was not found',
  HAS_CHILDREN: 'Organizational unit still has child units',
  HAS_MAPPED_USERS: 'Organizational unit still has mapped or directory users',
  PARENT_NOT_FOUND: 'Parent organizational unit was not found in the catalog',
  IDENTITY_CONFLICT: 'Distinguished name or path already exists in the catalog',
  INVALID_INPUT: 'Manual directory organizational unit input is invalid',
  CIRCULAR_REFERENCE:
    'Parent organizational unit cannot be a descendant of the unit being moved',
};

export function mapManualDirectoryCatalogError(error: unknown): never {
  if (!(error instanceof ManualDirectoryCatalogError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: messages[error.code] ?? error.code,
    ...(error.blockers.length > 0 ? { details: { blockers: error.blockers } } : {}),
  };
  if (error.code === 'NOT_FOUND' || error.code === 'PARENT_NOT_FOUND') {
    throw new NotFoundException(body);
  }
  if (conflictCodes.has(error.code)) {
    throw new ConflictException(body);
  }
  throw new BadRequestException(body);
}
