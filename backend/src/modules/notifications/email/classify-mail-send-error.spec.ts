import { classifyMailSendError, isMailProviderLimit, isPermanentRecipientFailure } from './classify-mail-send-error';

/**
 * Stvarni odgovori provajdera (incident 2026-10-16: Gmail 550-5.4.5). Nodemailer
 * daje `code`, `responseCode` i `response`; sve tri varijante su ovdje, jer se u
 * logu pojavljuje i sama poruka ("Data command failed: …").
 */
function smtpError(input: {
  message?: string;
  code?: string;
  responseCode?: number;
  response?: string;
}): Error {
  const error = new Error(input.message ?? 'Command failed');
  if (input.code !== undefined) (error as unknown as Record<string, unknown>).code = input.code;
  if (input.responseCode !== undefined) {
    (error as unknown as Record<string, unknown>).responseCode = input.responseCode;
  }
  if (input.response !== undefined) (error as unknown as Record<string, unknown>).response = input.response;
  return error;
}

describe('classifyMailSendError', () => {
  it('prepoznaje dnevni limit Gmail-a iz stvarnog odgovora', () => {
    const failure = classifyMailSendError(
      smtpError({
        message:
          "Data command failed: 550-5.4.5 Daily user sending limit exceeded. For more information on Gmail 550-5.4.5 sending limits go to 550 5.4.5 https://support.google.com/a/answer/166852",
        code: 'EENVELOPE',
        responseCode: 550,
        response: '550-5.4.5 Daily user sending limit exceeded.',
      }),
    );
    expect(failure.kind).toBe('dailyLimit');
    expect(failure.responseCode).toBe(550);
    expect(isMailProviderLimit(failure.kind)).toBe(true);
    // Razlog je kratak i tehnički (ide u log i u detalje alarma).
    expect(failure.reason.length).toBeLessThanOrEqual(160);
    expect(failure.reason).toContain('smtp=550');
  });

  it('prepoznaje dnevni limit i kad postoji samo prošireni kod 5.4.5', () => {
    expect(
      classifyMailSendError(smtpError({ message: 'Mail command failed: 5.4.5 quota', responseCode: 550 })).kind,
    ).toBe('dailyLimit');
  });

  it.each([
    ['421 4.7.0 Too many connections', 421, '421 4.7.0 Too many connections from your IP'],
    ['450 too many recipients', 450, '450 4.5.0 too many recipients in one message'],
    ['throttling', 451, '451 Requested action aborted: throttling, please retry later'],
  ])('prepoznaje kratkotrajno ograničenje: %s', (_label, responseCode, response) => {
    const failure = classifyMailSendError(smtpError({ responseCode, response }));
    expect(failure.kind).toBe('rateLimit');
    expect(isMailProviderLimit(failure.kind)).toBe(true);
  });

  it.each([
    ['EAUTH', 535, '535 5.7.139 Authentication unsuccessful'],
    ['EENVELOPE', 534, '534 Please log in via your web browser'],
    ['ENOAUTH', undefined, 'OAuth required'],
  ])('prepoznaje grešku vjerodajnica: %s', (code, responseCode, response) => {
    const failure = classifyMailSendError(
      smtpError({ code, response, ...(responseCode === undefined ? {} : { responseCode }) }),
    );
    expect(failure.kind).toBe('auth');
    expect(isMailProviderLimit(failure.kind)).toBe(false);
    expect(isPermanentRecipientFailure(failure.kind)).toBe(false);
  });

  it.each([
    '550 5.1.1 The email account that you tried to reach does not exist',
    '550 5.1.10 RESOLVER.RCP.Recipient not found',
    '550 Requested action not taken: mailbox unavailable',
    '553 Mailbox name not allowed',
    '550 recipient address rejected: User unknown in virtual mailbox table',
  ])('odbijenu adresu primaoca označi trajnom: %s', (response) => {
    const responseCode = Number.parseInt(response.slice(0, 3), 10);
    const failure = classifyMailSendError(smtpError({ responseCode, response }));
    expect(failure.kind).toBe('recipient');
    expect(isPermanentRecipientFailure(failure.kind)).toBe(true);
  });

  it.each([
    ['timeout', 'ETIMEDOUT', undefined, 'Connection timeout'],
    ['veza', 'ECONNECTION', undefined, 'Connection closed unexpectedly'],
    ['TLS', 'ETLS', undefined, 'self signed certificate'],
    ['4xx', undefined, 451, '451 4.3.0 Temporary server error'],
    ['mailbox full', undefined, 452, '452 4.2.2 Mailbox full'],
  ])('sve ostalo je privremeno: %s', (_label, code, responseCode, response) => {
    const failure = classifyMailSendError(
      smtpError({
        ...(code === undefined ? {} : { code }),
        ...(responseCode === undefined ? {} : { responseCode }),
        response,
      }),
    );
    expect(failure.kind).toBe('transient');
    expect(isPermanentRecipientFailure(failure.kind)).toBe(false);
  });

  it('nepoznata greška ostaje privremena (sigurnija strana)', () => {
    expect(classifyMailSendError(new Error('nešto čudno')).kind).toBe('transient');
    expect(classifyMailSendError('greška kao tekst').kind).toBe('transient');
    expect(classifyMailSendError(null).kind).toBe('transient');
    expect(classifyMailSendError(undefined).kind).toBe('transient');
  });

  it('čita brojčani kod i iz teksta kad responseCode nedostaje', () => {
    const failure = classifyMailSendError(
      smtpError({ message: 'Data command failed: 550-5.4.5 Daily user sending limit exceeded' }),
    );
    expect(failure.responseCode).toBe(550);
    expect(failure.kind).toBe('dailyLimit');
  });

  it('razlog nikad ne nosi cijeli odgovor ni lozinku', () => {
    const failure = classifyMailSendError(
      smtpError({ responseCode: 550, response: `550 daily limit exceeded ${'x'.repeat(400)}` }),
    );
    expect(failure.reason.length).toBeLessThanOrEqual(160);
  });
});
