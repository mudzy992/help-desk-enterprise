/** Stable, content-free codes for operational failures; never include provider text. */
export const inboundErrorCodes = {
  mailboxFailure: 'INBOUND_MAILBOX_FAILED',
  messageFailure: 'INBOUND_MESSAGE_PROCESSING_FAILED',
  noticeFailure: 'INBOUND_NOTICE_FAILED',
  misconfigured: 'INBOUND_MAILBOX_MISCONFIGURED',
} as const;
