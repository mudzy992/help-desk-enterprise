import { authenticationConstants } from '../authentication/authentication.constants';
import type { AuthorizationUserRecord } from './authorization.types';

export function isSuperAdminAuthorization(
  record: Pick<
    AuthorizationUserRecord,
    'isLocalOnly' | 'entraObjectId' | 'assignments'
  >,
): boolean {
  const hasSuperAdminRole = record.assignments.some(
    (assignment) =>
      assignment.roleKey === authenticationConstants.superAdminRoleKey,
  );
  if (!hasSuperAdminRole) {
    return false;
  }
  return record.isLocalOnly && record.entraObjectId === null;
}

export function isBrokenSuperAdminInvariant(
  record: Pick<
    AuthorizationUserRecord,
    'isLocalOnly' | 'entraObjectId' | 'assignments'
  >,
): boolean {
  const hasSuperAdminRole = record.assignments.some(
    (assignment) =>
      assignment.roleKey === authenticationConstants.superAdminRoleKey,
  );
  if (!hasSuperAdminRole) {
    return false;
  }
  return !isSuperAdminAuthorization(record);
}
