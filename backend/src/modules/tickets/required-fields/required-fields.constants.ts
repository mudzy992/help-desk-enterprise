export const requiredFieldKeys = {
  closeCode: 'close_code',
  resolutionNote: 'resolution_note',
} as const;

export const defaultRequiredOnResolveFields = [
  requiredFieldKeys.closeCode,
  requiredFieldKeys.resolutionNote,
] as const;

export const defaultTicketRequiredFieldsConfiguration = {
  enabled: true,
  globalRequiredOnResolve: defaultRequiredOnResolveFields,
  byService: {},
  enforceSchemaRequiredFields: true,
} as const;
