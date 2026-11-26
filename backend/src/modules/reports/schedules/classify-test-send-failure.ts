import { classifyMailSendError } from '../../notifications/email/classify-mail-send-error';
import { MailDeliverySuppressedError } from '../../notifications/email/mail-provider-limit-breaker';
import { NotificationEmailOutcomeUnknownError } from '../../notifications/email/notification-email-delivery-errors';

/**
 * E2E triage 2026-11-26 (`18-reports-schedules` na `master` runu `45789099561`).
 *
 * „Pošalji test meni“ je jedini put u izvještajima koji je grešku poštanskog
 * servera puštao van kao **500**. Kad Gmail vrati `550-5.4.5 Daily user sending
 * limit exceeded` (ili kad je prekidač provajdera već otvoren), administrator je
 * dobijao „Internal server error“ bez ijedne informacije, a E2E nije mogao
 * razlikovati stvarni kvar od potrošene dnevne kvote — pa je crveni test izgledao
 * kao regresija koda.
 *
 * Ugovor je isti kao za isključen kanal (`{ sent: false, reason }`, HTTP 200), a
 * razlozi su stabilni kodovi (bez teksta provajdera, bez adresa):
 *
 * | Razlog | Značenje |
 * | --- | --- |
 * | `EMAIL_PROVIDER_DAILY_LIMIT` | provajder je odbio zbog dnevne kvote (Gmail 5.4.5) |
 * | `EMAIL_PROVIDER_RATE_LIMIT` | privremeno ograničenje po minuti/vezi |
 * | `EMAIL_AUTH_FAILED` | pogrešne SMTP vjerodajnice — popravka je u postavkama |
 * | `EMAIL_RECIPIENT_REJECTED` | adresa primaoca je odbijena |
 * | `EMAIL_DELIVERY_UNKNOWN` | veza je pala poslije `DATA` — poruka je možda otišla |
 * | `EMAIL_DELIVERY_FAILED` | sve ostalo (mreža, TLS, timeout, 4xx) |
 */
export const testSendFailureReasons = {
  dailyLimit: 'EMAIL_PROVIDER_DAILY_LIMIT',
  rateLimit: 'EMAIL_PROVIDER_RATE_LIMIT',
  auth: 'EMAIL_AUTH_FAILED',
  recipient: 'EMAIL_RECIPIENT_REJECTED',
  transient: 'EMAIL_DELIVERY_FAILED',
} as const;

export type TestSendFailureReason = (typeof testSendFailureReasons)[keyof typeof testSendFailureReasons]
  | 'EMAIL_DELIVERY_UNKNOWN';

export function classifyTestSendFailure(error: unknown): TestSendFailureReason {
  // The breaker refuses locally (no SMTP was touched) — it already knows why.
  if (error instanceof MailDeliverySuppressedError) {
    return testSendFailureReasons[error.reason];
  }
  if (error instanceof NotificationEmailOutcomeUnknownError) {
    return 'EMAIL_DELIVERY_UNKNOWN';
  }
  return testSendFailureReasons[classifyMailSendError(error).kind];
}
