import { classifyTestSendFailure } from './classify-test-send-failure';
import { MailDeliverySuppressedError } from '../../notifications/email/mail-provider-limit-breaker';
import { NotificationEmailOutcomeUnknownError } from '../../notifications/email/notification-email-delivery-errors';

/*
  E2E triage 2026-11-26 (`18-reports-schedules` na `master` runu `45789099561`):
  „pošalji test meni“ je na odbijeno slanje vraćao 500. Ovi testovi drže ugovor
  koji E2E (i administrator) treba da vidi: stabilan razlog umjesto 500.
*/
describe('classifyTestSendFailure', () => {
  it('names an exhausted provider quota instead of hiding it', () => {
    // Gmail: `Data command failed: 550-5.4.5 Daily user sending limit exceeded.`
    const gmailRefusal = Object.assign(new Error('Data command failed'), {
      code: 'EENVELOPE',
      responseCode: 550,
      response: '550-5.4.5 Daily user sending limit exceeded. For more information, go to ...',
    });
    expect(classifyTestSendFailure(gmailRefusal)).toBe('EMAIL_PROVIDER_DAILY_LIMIT');
  });

  it('uses the breaker state when sending was suppressed before touching SMTP', () => {
    const suppressed = new MailDeliverySuppressedError(
      { reason: 'rateLimit', blockedUntilMs: Date.now() + 60_000 },
      Date.now(),
    );
    expect(classifyTestSendFailure(suppressed)).toBe('EMAIL_PROVIDER_RATE_LIMIT');
  });

  it('keeps a possibly-delivered message apart from a failed one', () => {
    expect(classifyTestSendFailure(new NotificationEmailOutcomeUnknownError())).toBe(
      'EMAIL_DELIVERY_UNKNOWN',
    );
  });

  it('separates credentials and rejected recipients from transient failures', () => {
    expect(
      classifyTestSendFailure(
        Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }),
      ),
    ).toBe('EMAIL_AUTH_FAILED');
    expect(
      classifyTestSendFailure(
        Object.assign(new Error('Mailbox unavailable'), {
          code: 'EENVELOPE',
          responseCode: 550,
          response: '550 5.1.1 The email account does not exist',
        }),
      ),
    ).toBe('EMAIL_RECIPIENT_REJECTED');
    expect(
      classifyTestSendFailure(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
    ).toBe('EMAIL_DELIVERY_FAILED');
  });

  it('never throws on a non-Error value', () => {
    expect(classifyTestSendFailure('boom')).toBe('EMAIL_DELIVERY_FAILED');
    expect(classifyTestSendFailure(undefined)).toBe('EMAIL_DELIVERY_FAILED');
  });
});
