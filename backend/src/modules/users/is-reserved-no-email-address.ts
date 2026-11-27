/**
 * Domains listed here (comma-separated) always get UI password delivery.
 *
 * W2.26 (`BA-users-02`): moved out of `issue-temporary-password-for-user` so the
 * channel decision and the send can share it without a module cycle.
 */
export function isReservedNoEmailAddress(
  email: string,
  domainsCsv: string = process.env.RESERVED_NO_EMAIL_DOMAINS ?? 'example.com',
): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (domain.length === 0) return false;
  return domainsCsv
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(domain);
}
