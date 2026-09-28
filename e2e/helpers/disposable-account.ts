/**
 * The harness rewrites test accounts directly in Postgres: global-setup deletes
 * the super admin's MFA (a fresh secret then lives only in .auth/mfa.json) and
 * overwrites the USER/AGENT password hashes. Pointed at a real person's account
 * that silently locks them out of MFA or replaces their password.
 *
 * Allowed: local part starting with "e2e." (e2e.superadmin@…), or an address
 * listed on purpose in E2E_ALLOW_REAL_ACCOUNTS (comma-separated).
 */
export function isDisposableTestAccount(email: string, allowList: string | undefined = process.env.E2E_ALLOW_REAL_ACCOUNTS): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.split('@')[0]?.startsWith('e2e.')) return true;
  return (allowList ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(normalized);
}

export function assertDisposableTestAccount(email: string, what: string): void {
  if (isDisposableTestAccount(email)) return;
  throw new Error(
    `[e2e] refusing to ${what} for ${email}: not a disposable test account. ` +
      'Use an e2e.* address (see e2e/.env.example) or, if you really mean it, ' +
      `add it to E2E_ALLOW_REAL_ACCOUNTS.`,
  );
}
