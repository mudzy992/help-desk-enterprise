import { groupsConstants } from './groups.constants';
import { GroupsError } from './groups.error';

export function normalizeGroupName(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > groupsConstants.maximumNameLength
  ) {
    throw new GroupsError('INVALID_NAME');
  }
  return normalized;
}
