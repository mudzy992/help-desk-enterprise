import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationalUnitError } from './organizational-unit.error';
import type { OrganizationalUnitErrorCode } from './organizational-unit.error';

const conflictCodes: readonly OrganizationalUnitErrorCode[] = [
  'DUPLICATE_DISTINGUISHED_NAME',
  'DUPLICATE_OU_PATH',
  'HAS_CHILDREN',
  'HAS_MAPPED_USERS',
  'HAS_GROUPS',
  'HAS_ASSETS',
  'HAS_CHANGE_REQUESTS',
  'HAS_KNOWLEDGE_ARTICLES',
  'HAS_PROBLEMS',
  'HAS_ROUTING_RULES',
  'HAS_SLA_RULES',
  'HAS_REPORT_SCHEDULES',
  'HAS_TICKETS',
  'RESOURCE_IN_USE',
];

const messages: Record<OrganizationalUnitErrorCode, string> = {
  NOT_FOUND: 'Organizational unit was not found',
  USER_NOT_FOUND: 'User was not found',
  INVALID_NAME: 'Organizational unit name is invalid',
  INVALID_DISTINGUISHED_NAME: 'Distinguished name is invalid',
  DISTINGUISHED_NAME_PARENT_MISMATCH:
    'Distinguished name must be a descendant of the parent distinguished name',
  INVALID_PARENT: 'Parent organizational unit was not found',
  SELF_PARENT: 'An organizational unit cannot be its own parent',
  CIRCULAR_HIERARCHY: 'The requested parent would create a circular hierarchy',
  DUPLICATE_DISTINGUISHED_NAME: 'Distinguished name already exists',
  DUPLICATE_OU_PATH: 'Organizational unit path already exists',
  HAS_CHILDREN: 'Organizational unit still has child units',
  HAS_MAPPED_USERS: 'Organizational unit still has mapped or directory users',
  HAS_GROUPS: 'Organizational unit is still linked to groups',
  HAS_ASSETS: 'Organizational unit is still linked to assets or asset records',
  HAS_CHANGE_REQUESTS: 'Organizational unit is still linked to change requests',
  HAS_KNOWLEDGE_ARTICLES: 'Organizational unit is still linked to knowledge records',
  HAS_PROBLEMS: 'Organizational unit is still linked to problems',
  HAS_ROUTING_RULES: 'Organizational unit is still linked to routing rules',
  HAS_SLA_RULES: 'Organizational unit is still linked to SLA rules',
  HAS_REPORT_SCHEDULES: 'Organizational unit is still linked to report schedules',
  HAS_TICKETS: 'Organizational unit is still linked to tickets',
  RESOURCE_IN_USE: 'Organizational unit is still in use',
};

export function mapOrganizationalUnitError(error: unknown): HttpException {
  if (!(error instanceof OrganizationalUnitError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: messages[error.code],
    ...(error.blockers.length > 0 ? { details: { blockers: error.blockers } } : {}),
  };
  if (error.code === 'NOT_FOUND' || error.code === 'USER_NOT_FOUND') {
    return new NotFoundException(body);
  }
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
