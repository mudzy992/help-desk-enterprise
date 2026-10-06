import type { AccountSecurityPolicy } from '../authentication/security/account-security-policy';
import { defaultAccountSecurityPolicy } from '../authentication/security/account-security-policy';
import type { PasswordPolicy } from '../authentication/security/password-policy';
import { installSuperAdminConstants } from './install-super-admin.constants';

/**
 * Paket 5.1 (M1 #1): the wizard's own fallback, used when the settings cannot be
 * read (a fresh database has no rows at all — the same state in which the
 * founder account is created). It mirrors `defaultAccountSecurityPolicy`, so the
 * founder never gets a weaker rule than the one every other account obeys.
 */
export const installSuperAdminDefaultPasswordPolicy: PasswordPolicy = {
  minLength: Math.max(
    installSuperAdminConstants.minimumPasswordLength,
    defaultAccountSecurityPolicy.passwordMinLength,
  ),
  maxLength: Math.min(
    installSuperAdminConstants.maximumPasswordLength,
    defaultAccountSecurityPolicy.passwordMaxLength,
  ),
  blocklistEnabled: defaultAccountSecurityPolicy.passwordBlocklistEnabled,
  organisationWords: [],
};

/** The policy the loader read from settings, shaped for `checkPassword`. */
export function toInstallPasswordPolicy(
  policy: AccountSecurityPolicy,
): PasswordPolicy {
  return {
    minLength: Math.max(
      installSuperAdminConstants.minimumPasswordLength,
      policy.passwordMinLength,
    ),
    maxLength: Math.min(
      installSuperAdminConstants.maximumPasswordLength,
      policy.passwordMaxLength,
    ),
    blocklistEnabled: policy.passwordBlocklistEnabled,
    organisationWords: policy.passwordOrganisationWords,
  };
}

/** What the wizard shows next to the password field. Rules only, never secrets. */
export type InstallPasswordPolicyPublic = {
  readonly minLength: number;
  readonly maxLength: number;
  readonly blocklistEnabled: boolean;
};

export function describeInstallPasswordPolicy(
  policy: PasswordPolicy,
): InstallPasswordPolicyPublic {
  return {
    minLength: policy.minLength,
    maxLength: policy.maxLength,
    blocklistEnabled: policy.blocklistEnabled,
  };
}
