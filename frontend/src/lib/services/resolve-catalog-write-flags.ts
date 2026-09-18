import type { CurrentSessionResponse } from "@/services/session-api";

export function canBypassAdminReadOnly(
  session: CurrentSessionResponse | null,
): boolean {
  return (
    session?.isSuperAdmin === true && session.principal.isLocalOnly === true
  );
}

export function resolveCatalogWriteFlags(input: {
  readonly hasCatalogWrite: boolean;
  readonly hasAvailabilityWrite: boolean;
  readonly hasFormsWrite: boolean;
  readonly isModuleLocked: boolean;
  readonly canBypass: boolean;
}): {
  readonly canWriteCatalog: boolean;
  readonly canWriteAvailability: boolean;
  readonly canManageForms: boolean;
  readonly writesBlocked: boolean;
} {
  const writesBlocked = input.isModuleLocked && !input.canBypass;
  return {
    writesBlocked,
    canWriteCatalog: input.hasCatalogWrite && !writesBlocked,
    canWriteAvailability: input.hasAvailabilityWrite && !writesBlocked,
    canManageForms: input.hasFormsWrite && !writesBlocked,
  };
}
