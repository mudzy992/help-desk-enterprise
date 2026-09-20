import { t, type UiLanguage, type UiStringKey } from './ui-strings';

/** Kratka relativna vremenska oznaka ("upravo", "prije 5 min", …). */
export function formatTimeAgo(isoDate: string, language: UiLanguage): string {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (diffSeconds < 60) {
    return t('time.justNow', undefined, language);
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return t('time.minutesAgo', { n: diffMinutes }, language);
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return t('time.hoursAgo', { n: diffHours }, language);
  }
  return t('time.daysAgo', { n: Math.floor(diffHours / 24) }, language);
}

/** HH:mm kod mjehura poruka. */
export function formatClock(isoDate: string, language: UiLanguage): string {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  return new Intl.DateTimeFormat(language === 'bs' ? 'bs-BA' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

const knownStatuses = new Set([
  'PENDING',
  'UNROUTED',
  'PENDING_APPROVAL',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
]);

const knownPriorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export function statusLabel(status: string, language: UiLanguage): string {
  const normalized = status.toUpperCase();
  if (knownStatuses.has(normalized)) {
    return t(`status.${normalized}` as UiStringKey, undefined, language);
  }
  return t('status.UNKNOWN', undefined, language);
}

export function priorityLabel(priority: string, language: UiLanguage): string {
  const normalized = priority.toUpperCase();
  if (knownPriorities.has(normalized)) {
    return t(`priority.${normalized}` as UiStringKey, undefined, language);
  }
  return t('priority.MEDIUM', undefined, language);
}

/** Stabilne CSS klase (kontraste validirati pri promjeni palete). */
export function statusChipClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'RESOLVED':
      return 'chip chip--green';
    case 'WAITING_FOR_USER':
    case 'PENDING_APPROVAL':
      return 'chip chip--amber';
    case 'ASSIGNED':
    case 'IN_PROGRESS':
      return 'chip chip--blue';
    default:
      return 'chip chip--slate';
  }
}

export function priorityChipClass(priority: string): string {
  switch (priority.toUpperCase()) {
    case 'CRITICAL':
      return 'chip chip--red';
    case 'HIGH':
      return 'chip chip--amber';
    case 'MEDIUM':
      return 'chip chip--blue';
    default:
      return 'chip chip--slate';
  }
}
