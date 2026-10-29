export type CanonicalAssignmentScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'organizational-unit'; readonly organizationalUnitId: string; readonly organizationalUnitPath: string }
  | { readonly kind: 'service'; readonly serviceId: string };

export type CanonicalPrincipalAssignment = {
  readonly assignmentId: string;
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly scope: CanonicalAssignmentScope;
};

export function resolveCanonicalScope(input: {
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
}): CanonicalAssignmentScope | null {
  const ouId = input.organizationalUnitId?.trim() || null;
  const ouPath = input.organizationalUnitPath?.trim() || null;
  const serviceId = input.serviceId?.trim() || null;
  if (serviceId && (ouId || ouPath)) return null;
  if ((ouId === null) !== (ouPath === null)) return null;
  if (ouId && ouPath) return { kind: 'organizational-unit', organizationalUnitId: ouId, organizationalUnitPath: ouPath };
  if (serviceId) return { kind: 'service', serviceId };
  return { kind: 'global' };
}
