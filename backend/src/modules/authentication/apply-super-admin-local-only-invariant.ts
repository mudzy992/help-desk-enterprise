export function applySuperAdminLocalOnlyInvariant(): {
  readonly isLocalOnly: true;
  readonly entraObjectId: null;
} {
  return {
    isLocalOnly: true,
    entraObjectId: null,
  };
}
