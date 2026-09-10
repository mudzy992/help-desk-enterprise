import { isNonEmptyScopeValue } from './does-organizational-unit-scope-cover';

export function doesServiceScopeCover(input: {
  readonly assignedServiceId: string | null;
  readonly requestedServiceId: string | null;
}): boolean {
  if (!isNonEmptyScopeValue(input.requestedServiceId)) {
    return false;
  }
  if (input.assignedServiceId === null) {
    return true;
  }
  if (!isNonEmptyScopeValue(input.assignedServiceId)) {
    return false;
  }
  return input.assignedServiceId.trim() === input.requestedServiceId.trim();
}
