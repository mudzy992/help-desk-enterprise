import type {
  DirectoryGroup,
  DirectoryOrganizationalUnit,
  DirectoryReadResult,
  DirectoryUser,
} from './directory-sync.types';

export function freezeDirectoryReadResult(
  result: DirectoryReadResult,
): DirectoryReadResult {
  return Object.freeze({
    strategy: result.strategy,
    operation: result.operation,
    scope: Object.freeze({ ...result.scope }),
    users: Object.freeze(result.users.map(freezeDirectoryUser)),
    groups: Object.freeze(result.groups.map(freezeDirectoryGroup)),
    organizationalUnits: Object.freeze(
      result.organizationalUnits.map(freezeDirectoryOrganizationalUnit),
    ),
  });
}

function freezeDirectoryUser(user: DirectoryUser): DirectoryUser {
  return Object.freeze({ ...user });
}

function freezeDirectoryGroup(group: DirectoryGroup): DirectoryGroup {
  return Object.freeze({ ...group });
}

function freezeDirectoryOrganizationalUnit(
  organizationalUnit: DirectoryOrganizationalUnit,
): DirectoryOrganizationalUnit {
  return Object.freeze({ ...organizationalUnit });
}
