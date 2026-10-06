import { isEmail } from 'class-validator';
import { normalizeEmailAddress } from '../authentication/normalize-email-address';
import { checkPassword } from '../authentication/security/password-policy';
import type { PasswordPolicy } from '../authentication/security/password-policy';
import { installSuperAdminConstants } from './install-super-admin.constants';
import { InstallSuperAdminError } from './install-super-admin.error';
import { installSuperAdminDefaultPasswordPolicy } from './install-super-admin-password-policy';
import type { CreateInstallSuperAdminInput } from './install-super-admin.types';

export type ValidatedInstallSuperAdminCredentials = {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
};

/**
 * Paket 5.1 (M1 #1): the founder account is a local account like any other, so
 * it obeys the account-security policy (length, common-password blocklist,
 * organisation words, own e-mail parts). Before, only a fixed 12–128 check ran
 * and `password12345` was accepted for the most privileged account.
 */
export function validateInstallSuperAdminCredentials(
  input: CreateInstallSuperAdminInput,
  passwordPolicy: PasswordPolicy = installSuperAdminDefaultPasswordPolicy,
): ValidatedInstallSuperAdminCredentials {
  const email = normalizeEmailAddress(input.email);
  const displayName = input.displayName.trim();
  const password = input.password;
  if (
    !isEmail(email) ||
    email.length > installSuperAdminConstants.maximumEmailLength ||
    displayName.length === 0 ||
    displayName.length > installSuperAdminConstants.maximumDisplayNameLength
  ) {
    throw new InstallSuperAdminError('INVALID_SUPER_ADMIN_CREDENTIALS');
  }
  const violations = checkPassword(password, email, passwordPolicy);
  if (violations.length > 0) {
    throw new InstallSuperAdminError(
      'PASSWORD_POLICY_VIOLATIONS',
      undefined,
      violations,
    );
  }
  return { email, displayName, password };
}
