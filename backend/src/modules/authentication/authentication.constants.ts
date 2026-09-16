export const authenticationConstants = {
  modes: ['local', 'entra_ad'] as const,
  superAdminRoleKey: 'SUPER_ADMIN',
  localPasswordCostFactor: 12,
  sessionTtlSeconds: 8 * 60 * 60,
  passwordChangeTokenTtlSeconds: 15 * 60,
  passwordChangePurpose: 'password_change',
  minimumJwtSigningSecretLength: 32,
  dummyLocalPasswordHash:
    '$2b$12$y2kLUePvsUF0aUToCZAGEOydZDkmf/R/0W7ZpUpV2RjoqzIc5c8pO',
} as const;
