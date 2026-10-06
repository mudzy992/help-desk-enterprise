export const installSuperAdminConstants = {
  minimumPasswordLength: 12,
  maximumPasswordLength: 128,
  maximumDisplayNameLength: 120,
  maximumEmailLength: 254,
  roleName: 'SuperAdmin',
} as const;

export const installSuperAdminErrorCodes = {
  invalidCredentials: 'INVALID_SUPER_ADMIN_CREDENTIALS',
  passwordPolicyViolations: 'PASSWORD_POLICY_VIOLATIONS',
  alreadyExists: 'SUPER_ADMIN_ALREADY_EXISTS',
  emailTaken: 'SUPER_ADMIN_EMAIL_TAKEN',
} as const;
