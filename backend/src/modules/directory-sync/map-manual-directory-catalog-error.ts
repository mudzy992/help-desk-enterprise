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
  // W2.36c: both are "the tree already has this row", i.e. a conflict.
  'DUPLICATE_PATH',
  'DUPLICATE_DISTINGUISHED_NAME',
]);

const messages: Record<string, string> = {
  NOT_FOUND: 'Manual directory organizational unit was not found',
  HAS_CHILDREN: 'Organizational unit still has child units',
  HAS_MAPPED_USERS: 'Organizational unit still has mapped or directory users',
  PARENT_NOT_FOUND: 'Parent organizational unit was not found in the catalog',
  IDENTITY_CONFLICT: 'Distinguished name or path already exists in the catalog',
  INVALID_INPUT: 'Manual directory organizational unit input is invalid',
  INVALID_NAME:
    'Organizational unit name is empty, too long, or contains a character a distinguished name cannot carry',
  DUPLICATE_PATH: 'An organizational unit with that path already exists',
  DUPLICATE_DISTINGUISHED_NAME:
    'An organizational unit with that distinguished name already exists',
  DIRECTORY_NAMESPACE_UNKNOWN:
    'The directory namespace cannot be derived: no organizational unit exists yet',
  CIRCULAR_REFERENCE:
    'Parent organizational unit cannot be a descendant of the unit being moved',
};

export function mapManualDirectoryCatalogError(error: unknown): never {
  if (!(error instanceof ManualDirectoryCatalogError)) {
    throw error;
  }
  const details = {
    ...(error.blockers.length > 0 ? { blockers: error.blockers } : {}),
    ...error.details,
  };
  const body = {
    code: error.code,
    message: messages[error.code] ?? error.code,
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
  if (error.code === 'NOT_FOUND' || error.code === 'PARENT_NOT_FOUND') {
    throw new NotFoundException(body);
  }
  if (conflictCodes.has(error.code)) {
    throw new ConflictException(body);
  }
  throw new BadRequestException(body);
}
