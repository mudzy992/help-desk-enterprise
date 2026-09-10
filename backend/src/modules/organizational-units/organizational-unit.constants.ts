export const organizationalUnitConstants = {
  maximumNameLength: 128,
  maximumDistinguishedNameLength: 1024,
  maximumOptionalAttributeLength: 128,
  allowedDistinguishedNameAttributeTypes: ['OU', 'DC', 'CN', 'O'] as const,
} as const;
