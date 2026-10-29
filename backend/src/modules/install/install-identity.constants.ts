/**
 * Install wizard v2 (F2): the identity step codes. `INVALID_*` are 400s the
 * wizard shows next to the field; the settings registry rejects the rest with
 * its own `INVALID_SETTING_VALUE`, mapped to the same answer.
 */
export const installIdentityErrorCodes = {
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  invalidInput: 'INSTALL_IDENTITY_INVALID',
  invalidLocale: 'INSTALL_IDENTITY_LOCALE_UNSUPPORTED',
  invalidTimeZone: 'INSTALL_IDENTITY_TIME_ZONE_UNKNOWN',
} as const;

export const installIdentityChangeReason = 'install_identity';
