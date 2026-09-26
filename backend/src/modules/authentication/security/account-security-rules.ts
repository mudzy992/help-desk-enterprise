import { authenticationConstants } from '../authentication.constants';
import type { AccountSecurityPolicy } from './account-security-policy';

/*
  Paket 2.1: pure decisions (MFA requirement, password expiry). Kept free of
  I/O so the matrix is unit tested exhaustively.
*/
export type MfaRequirement = 'required' | 'optional' | 'unavailable';

export type AccountSubject = {
  readonly roleKeys: readonly string[];
  readonly hasLocalPassword: boolean;
  readonly entraObjectId: string | null;
};

export function resolveMfaRequirement(subject: AccountSubject, policy: AccountSecurityPolicy): MfaRequirement {
  // Entra accounts: MFA is Microsoft's job (Conditional Access).
  if (!subject.hasLocalPassword) return 'unavailable';
  if (subject.roleKeys.includes(authenticationConstants.superAdminRoleKey)) return 'required';
  if (policy.mfaRequiredForAdmins && subject.roleKeys.includes('ADMIN')) return 'required';
  return policy.mfaAllowOptional ? 'optional' : 'unavailable';
}

export function passwordExpiresAt(
  subject: { readonly roleKeys: readonly string[]; readonly passwordChangedAt?: Date | null },
  policy: AccountSecurityPolicy,
): Date | null {
  const days = subject.roleKeys.includes(authenticationConstants.superAdminRoleKey)
    ? policy.superAdminPasswordMaxAgeDays
    : policy.passwordMaxAgeDays;
  if (days <= 0 || !subject.passwordChangedAt) return null;
  return new Date(subject.passwordChangedAt.getTime() + days * 86_400_000);
}

export function isPasswordExpired(
  subject: { readonly roleKeys: readonly string[]; readonly passwordChangedAt?: Date | null },
  policy: AccountSecurityPolicy,
  now: Date = new Date(),
): boolean {
  const expiresAt = passwordExpiresAt(subject, policy);
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}
