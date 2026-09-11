import { applySuperAdminLocalOnlyInvariant } from '../authentication/apply-super-admin-local-only-invariant';
import type {
  InstallSuperAdminPersistence,
  InstallSuperAdminPublicRecord,
} from './install-super-admin.types';

export function mapInstallSuperAdminPublicRecord(
  user: InstallSuperAdminPersistence,
): InstallSuperAdminPublicRecord | null {
  const localOnly = applySuperAdminLocalOnlyInvariant();
  if (
    !user.isLocalOnly ||
    user.entraObjectId !== localOnly.entraObjectId ||
    user.email.length === 0 ||
    user.displayName.length === 0
  ) {
    return null;
  }
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    isLocalOnly: localOnly.isLocalOnly,
  };
}
