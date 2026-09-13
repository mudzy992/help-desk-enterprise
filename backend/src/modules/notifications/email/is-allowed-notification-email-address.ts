import { internalNotificationEmailDomain } from './email-template.constants';

export type NotificationEmailRecipientPolicy = {
  readonly internalOnly: boolean;
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
  if (isInternalNotificationEmailAddress(normalized)) {
    return true;
  }
  if (policy.internalOnly) {
    return false;
  }
  return (
    policy.allowedExternalEmails.includes(normalized) ||
    policy.allowedExternalDomains.includes(readEmailDomain(normalized))
  );
}

export function isInternalNotificationEmailAddress(address: string): boolean {
  const normalized = normalizeEmailAddress(address);
  if (normalized === null) {
    return false;
  }
  return readEmailDomain(normalized) === internalNotificationEmailDomain;
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
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain) && domain !== 'epbih.ba') {
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
