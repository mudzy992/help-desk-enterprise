/**
 * Who may receive notification e-mail (and, for inbound mail, who may send).
 * `internalOnly` on: the internal domains plus the extra allowed domains and
 * addresses. Off: any syntactically valid address. The internal domains come
 * from `private.notifications.email.internalDomainsCsv`; nothing is hardcoded.
 */
export type NotificationEmailRecipientPolicy = {
  readonly internalOnly: boolean;
  readonly internalDomains: readonly string[];
  readonly allowedExternalDomains: readonly string[];
  readonly allowedExternalEmails: readonly string[];
};

export function isAllowedNotificationEmailAddress(
  address: string,
  policy: NotificationEmailRecipientPolicy,
): boolean {
  const normalized = normalizeEmailAddress(address);
  if (normalized === null) {
    return false;
  }
  if (!policy.internalOnly) {
    return true;
  }
  const domain = readEmailDomain(normalized);
  return (
    policy.internalDomains.includes(domain) ||
    policy.allowedExternalEmails.includes(normalized) ||
    policy.allowedExternalDomains.includes(domain)
  );
}

export function normalizeEmailAddress(address: string): string | null {
  const trimmed = address.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    return null;
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length === 0 || domain.length === 0 || domain.includes(' ')) {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain)) {
    return null;
  }
  if (!domain.includes('.')) {
    return null;
  }
  return `${local}@${domain}`;
}

function readEmailDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1);
}
