export const installPolicyPackConstants = {
  changeLogReason: 'install_wizard',
} as const;

export const installPolicyPackErrorCodes = {
  /** The pack is not part of the blueprint the catalog step applied. */
  unknownPack: 'POLICY_PACK_NOT_OFFERED',
  /** The structure step has not run: there is no unit to grant the pack on. */
  structureRequired: 'POLICY_PACK_STRUCTURE_REQUIRED',
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  /** Same code the Settings screen answers with (`private.policyPacks.disabledKeysCsv`). */
  packDisabled: 'PACK_DISABLED',
} as const;
