export const installSmtpTestConstants = {
  subject: '[TEST] Provjera SMTP postavki iz čarobnjaka instalacije',
  body:
    'Ovo je testna poruka koju je poslao čarobnjak instalacije. Ako je vidite, ' +
    'SMTP postavke rade i e-mail notifikacije mogu se uključiti.',
  /** Same limit as the e-mail templates screen; see `TestEmailRateLimiter`. */
  addressPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

export const installSmtpTestErrorCodes = {
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  notConfigured: 'SMTP_TEST_NOT_CONFIGURED',
  invalidRecipient: 'SMTP_TEST_INVALID_RECIPIENT',
  rateLimited: 'SMTP_TEST_RATE_LIMITED',
  authFailed: 'SMTP_TEST_AUTH_FAILED',
  tlsFailed: 'SMTP_TEST_TLS_FAILED',
  unreachable: 'SMTP_TEST_UNREACHABLE',
  timeout: 'SMTP_TEST_TIMEOUT',
  sendFailed: 'SMTP_TEST_SEND_FAILED',
} as const;
