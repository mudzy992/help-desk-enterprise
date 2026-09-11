import { isEmail } from 'class-validator';
import { normalizeEmailAddress } from '../authentication/normalize-email-address';
import { installSuperAdminConstants } from './install-super-admin.constants';
import { InstallSuperAdminError } from './install-super-admin.error';
import type { CreateInstallSuperAdminInput } from './install-super-admin.types';

export type ValidatedInstallSuperAdminCredentials = {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
};

export function validateInstallSuperAdminCredentials(
  input: CreateInstallSuperAdminInput,
): ValidatedInstallSuperAdminCredentials {
  const email = normalizeEmailAddress(input.email);
  const displayName = input.displayName.trim();
  const password = input.password;
  if (
    !isEmail(email) ||
    email.length > installSuperAdminConstants.maximumEmailLength ||
    displayName.length === 0 ||
    displayName.length > installSuperAdminConstants.maximumDisplayNameLength ||
    password.length < installSuperAdminConstants.minimumPasswordLength ||
    password.length > installSuperAdminConstants.maximumPasswordLength ||
    !/\S/.test(password) ||
    password.toLowerCase() === email
  ) {
    throw new InstallSuperAdminError('INVALID_SUPER_ADMIN_CREDENTIALS');
  }
  return { email, displayName, password };
}
