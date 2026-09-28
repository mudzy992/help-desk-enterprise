import type { EmailLocale } from '../notifications/email/email-template.constants';
import { opsAlertCatalog, type OpsAlertKey, type OpsAlertSeverity } from './ops-alert-catalog';
import type { AlertNotificationKind } from './alert-state-machine';

/**
 * Paket 2.7 (§5.3): the same wording for e-mail, Teams and the fallback
 * channel. Everything here is technical (numbers, queue names) - alarms never
 * carry personal data.
 */
export type OpsAlertMessage = {
  readonly key: OpsAlertKey | 'ops.test';
  readonly severity: OpsAlertSeverity;
  readonly kind: AlertNotificationKind | 'test';
  readonly details: Readonly<Record<string, unknown>>;
  readonly firstSeenAt: Date;
  readonly resolvedAt: Date | null;
};

export const opsSeverityColors = {
  CRITICAL: '#B91C1C',
  WARNING: '#B45309',
  resolved: '#15803D',
} as const;

const labels = {
  bs: {
    severity: { CRITICAL: 'KRITIČNO', WARNING: 'UPOZORENJE' },
    kind: {
      opened: 'novi alarm',
      escalated: 'pogoršanje',
      reminder: 'i dalje aktivno',
      resolved: 'riješeno',
      test: 'testna poruka',
    },
    resolvedAfter: (minutes: string) => `riješeno nakon ${minutes}`,
    activeFor: (minutes: string) => `aktivno ${minutes}`,
    testTitle: 'Testni alarm',
    testAction: 'Ovo je probna poruka iz kartice Zdravlje sistema. Ako je vidite, kanal radi.',
    detailsTitle: 'Detalji',
    columns: ['Stavka', 'Vrijednost'],
    whatToDo: 'Šta uraditi',
    runbook: 'Uputstvo',
    footer: 'Primate ovu poruku jer primate operativne alarme (ops.alerts.receive) ili ste na listi dodatnih primalaca.',
    since: 'Od',
    reasons: { not_picked_up: 'nije preuzet', failing: 'stalno pada' },
    fields: {
      usedPercent: 'Zauzeto (%)',
      freeGb: 'Slobodno (GB)',
      totalGb: 'Ukupno (GB)',
      failOpen: 'Prilozi bez skeniranja (CLAMAV_FAIL_OPEN)',
      minutesSinceSuccess: 'Minuta od posljednjeg uspjeha',
      thresholdMinutes: 'Prag (min)',
      newFailures: 'Novih neuspjelih poslova',
      integrationDlq: 'Integracije u DLQ',
      errors5xx: 'Greške 5xx',
      total: 'Ukupno zahtjeva',
      percent: 'Udio (%)',
      windowMinutes: 'Prozor (min)',
      meanLagMs: 'Prosječno kašnjenje (ms)',
      daysLeft: 'Dana do isteka',
      expiresAt: 'Ističe',
      heartbeatAgeSeconds: 'Sekundi od posljednjeg signala',
      thresholdSeconds: 'Prag (s)',
      snapshotAgeSeconds: 'Sekundi od posljednje provjere',
    } as Record<string, string>,
    yes: 'da',
    no: 'ne',
    unknown: 'nepoznato',
  },
  en: {
    severity: { CRITICAL: 'CRITICAL', WARNING: 'WARNING' },
    kind: {
      opened: 'new alarm',
      escalated: 'escalated',
      reminder: 'still active',
      resolved: 'resolved',
      test: 'test message',
    },
    resolvedAfter: (minutes: string) => `resolved after ${minutes}`,
    activeFor: (minutes: string) => `active for ${minutes}`,
    testTitle: 'Test alarm',
    testAction: 'This is a test message from the System health card. If you can read it, the channel works.',
    detailsTitle: 'Details',
    columns: ['Item', 'Value'],
    whatToDo: 'What to do',
    runbook: 'Runbook',
    footer: 'You receive this message because you receive operational alarms (ops.alerts.receive) or are on the extra recipient list.',
    since: 'Since',
    reasons: { not_picked_up: 'not picked up', failing: 'keeps failing' },
    fields: {
      usedPercent: 'Used (%)',
      freeGb: 'Free (GB)',
      totalGb: 'Total (GB)',
      failOpen: 'Attachments pass unscanned (CLAMAV_FAIL_OPEN)',
      minutesSinceSuccess: 'Minutes since last success',
      thresholdMinutes: 'Threshold (min)',
      newFailures: 'New failed jobs',
      integrationDlq: 'Integrations in DLQ',
      errors5xx: '5xx errors',
      total: 'Total requests',
      percent: 'Share (%)',
      windowMinutes: 'Window (min)',
      meanLagMs: 'Mean delay (ms)',
      daysLeft: 'Days until expiry',
      expiresAt: 'Expires',
      heartbeatAgeSeconds: 'Seconds since last heartbeat',
      thresholdSeconds: 'Threshold (s)',
      snapshotAgeSeconds: 'Seconds since last check',
    } as Record<string, string>,
    yes: 'yes',
    no: 'no',
    unknown: 'unknown',
  },
} as const;

export function opsAlertTitle(message: Pick<OpsAlertMessage, 'key'>, locale: EmailLocale): string {
  return message.key === 'ops.test' ? labels[locale].testTitle : opsAlertCatalog[message.key].title[locale];
}

export function opsAlertAction(message: Pick<OpsAlertMessage, 'key'>, locale: EmailLocale): string {
  return message.key === 'ops.test' ? labels[locale].testAction : opsAlertCatalog[message.key].action[locale];
}

export function opsAlertRunbook(message: Pick<OpsAlertMessage, 'key'>): string | null {
  return message.key === 'ops.test' ? null : opsAlertCatalog[message.key].runbook;
}

export function formatDuration(milliseconds: number, locale: EmailLocale): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = locale === 'bs' ? 'h' : 'h';
  return rest === 0 ? `${hours} ${h}` : `${hours} ${h} ${rest} min`;
}

/** "KRITIČNO · novi alarm" / "WARNING · resolved after 12 min". */
export function opsAlertStateLine(message: OpsAlertMessage, locale: EmailLocale, now: Date): string {
  const text = labels[locale];
  if (message.kind === 'resolved') {
    const end = message.resolvedAt ?? now;
    return `${text.severity[message.severity]} · ${text.resolvedAfter(formatDuration(end.getTime() - message.firstSeenAt.getTime(), locale))}`;
  }
  if (message.kind === 'reminder') {
    return `${text.severity[message.severity]} · ${text.activeFor(formatDuration(now.getTime() - message.firstSeenAt.getTime(), locale))}`;
  }
  return `${text.severity[message.severity]} · ${text.kind[message.kind]}`;
}

export function opsAlertColor(message: Pick<OpsAlertMessage, 'kind' | 'severity'>): string {
  return message.kind === 'resolved' ? opsSeverityColors.resolved : opsSeverityColors[message.severity];
}

/** Label/value rows of the details; nested lists (late jobs, queues) flatten to one row each. */
export function opsAlertDetailRows(
  message: Pick<OpsAlertMessage, 'details'>,
  locale: EmailLocale,
): Array<{ readonly label: string; readonly value: string }> {
  const text = labels[locale];
  const rows: Array<{ label: string; value: string }> = [];
  for (const [field, value] of Object.entries(message.details)) {
    if (field === 'jobs' && Array.isArray(value)) {
      for (const job of value as Array<Record<string, unknown>>) {
        const reason = text.reasons[job.reason as 'not_picked_up' | 'failing'] ?? String(job.reason);
        rows.push({ label: `${String(job.queue)} / ${String(job.schedulerId)}`, value: `${reason}, ${String(job.minutesLate)} min` });
      }
      continue;
    }
    if (field === 'failedByQueue' && typeof value === 'object' && value !== null) {
      for (const [queue, count] of Object.entries(value as Record<string, unknown>)) {
        rows.push({ label: `${text.fields.newFailures}: ${queue}`, value: String(count) });
      }
      continue;
    }
    rows.push({ label: text.fields[field] ?? field, value: formatValue(value, locale) });
  }
  return rows;
}

function formatValue(value: unknown, locale: EmailLocale): string {
  const text = labels[locale];
  if (value === null || value === undefined) return text.unknown;
  if (typeof value === 'boolean') return value ? text.yes : text.no;
  if (typeof value === 'number') return new Intl.NumberFormat(locale === 'bs' ? 'bs-BA' : 'en-GB').format(value);
  return String(value);
}

export function opsAlertLabels(locale: EmailLocale) {
  return labels[locale];
}
