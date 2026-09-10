import {
  isBrokenSuperAdminInvariant,
  isSuperAdminAuthorization,
} from './is-super-admin-authorization';
import type {
  AuthorizationAssignment,
  AuthorizationContext,
  AuthorizationUserRecord,
} from './authorization.types';

function normalizeAssignment(
  assignment: AuthorizationAssignment,
): AuthorizationAssignment | null {
  const roleKey = assignment.roleKey.trim();
  if (roleKey.length === 0) {
    return null;
  }
  const permissionKeys = assignment.permissionKeys
    .map((permissionKey) => permissionKey.trim())
    .filter((permissionKey) => permissionKey.length > 0);
  const organizationalUnitId =
    assignment.organizationalUnitId === null ||
    assignment.organizationalUnitId.trim().length === 0
      ? null
      : assignment.organizationalUnitId.trim();
  const organizationalUnitPath =
    assignment.organizationalUnitPath === null ||
    assignment.organizationalUnitPath.trim().length === 0
      ? null
      : assignment.organizationalUnitPath.trim();
  if (
    (organizationalUnitId === null) !== (organizationalUnitPath === null)
  ) {
    return null;
  }
  const serviceId =
    assignment.serviceId === null || assignment.serviceId.trim().length === 0
      ? null
      : assignment.serviceId.trim();
  return {
    roleKey,
    permissionKeys,
    organizationalUnitId,
    organizationalUnitPath,
    serviceId,
  };
}

export function createAuthorizationContext(
  record: AuthorizationUserRecord | null,
): AuthorizationContext | null {
  if (record === null || !record.isActive || record.id.trim().length === 0) {
    return null;
  }
  if (isBrokenSuperAdminInvariant(record)) {
    return null;
  }
  const assignments = record.assignments
    .map(normalizeAssignment)
    .filter((assignment): assignment is AuthorizationAssignment => assignment !== null);
  return {
    subjectId: record.id.trim(),
    isLocalOnly: record.isLocalOnly,
    isSuperAdmin: isSuperAdminAuthorization(record),
    assignments,
  };
}
