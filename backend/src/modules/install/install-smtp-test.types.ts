/**
 * F4.1: the result of „Pošalji test“. A failure is an error with a mapped code
 * (`SMTP_TEST_AUTH_FAILED`, `SMTP_TEST_TLS_FAILED`, `SMTP_TEST_UNREACHABLE`,
 * `SMTP_TEST_TIMEOUT`, `SMTP_TEST_SEND_FAILED`) — the wizard shows advice per
 * code instead of parsing a message.
 */
export type InstallSmtpTestInput = {
  /** Defaults to the super admin's address; the operator may send it elsewhere. */
  readonly toAddress?: string;
};

export type InstallSmtpTestResult = {
  readonly isSent: true;
  readonly toAddress: string;
};
