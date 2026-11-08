type InboundEmailOperation = 'reply' | 'reopen' | 'attachment' | 'attachment-rejected';

/** Stable, bounded keys shared by every replay of the same inbound message. */
export function inboundEmailIdempotencyKey(
  inboundEmailId: string,
  operation: InboundEmailOperation,
  attachmentIndex?: number,
): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(inboundEmailId)) throw new Error('Invalid inbound email id');
  if (attachmentIndex !== undefined && (!Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0)) {
    throw new Error('Invalid inbound attachment index');
  }
  const key = `inbound-email:${inboundEmailId}:${operation}${attachmentIndex === undefined ? '' : `:${attachmentIndex}`}`;
  if (key.length > 128) throw new Error('Inbound email idempotency key is too long');
  return key;
}
