import type { InboundIgnoreReason, InboundMessage } from './inbound-email.types';

const autoSubjects = [
  /^(auto(matic)?\s*(reply|response|antwort)|out of (the )?office|abwesenheit|automatski odgovor|odsutan|odsutna|nisam u uredu|van ureda)\b/i,
  /^(undeliverable|undelivered mail|delivery status notification|mail delivery (failed|subsystem)|nedostavljivo|isporuka nije uspjela)\b/i,
];
const bounceSenders = /^(mailer-daemon|postmaster|microsoftexchange[0-9a-f]*|no-?reply|noreply)@/i;

function header(message: InboundMessage, name: string): string[] {
  return [...(message.headers.get(name) ?? [])].map((value) => value.trim());
}

/**
 * Paket 2.3 (R11): messages that must never become ticket messages and must
 * never get an automatic answer (RFC 3834 + Exchange/Gmail conventions).
 */
export function detectAutoReply(
  message: InboundMessage,
  ownAddresses: readonly string[],
): InboundIgnoreReason | null {
  const from = message.fromAddress ?? '';
  if (from.length > 0 && ownAddresses.some((own) => own.toLowerCase() === from)) return 'OWN_MESSAGE';
  const autoSubmitted = header(message, 'auto-submitted').map((value) => value.toLowerCase());
  if (autoSubmitted.some((value) => value !== 'no')) return 'AUTO_REPLY';
  if (header(message, 'x-auto-response-suppress').length > 0) return 'AUTO_REPLY';
  if (header(message, 'x-autoreply').length > 0 || header(message, 'x-autorespond').length > 0) return 'AUTO_REPLY';
  if (header(message, 'x-ms-exchange-inbox-rules-loop').length > 0) return 'AUTO_REPLY';
  if (header(message, 'x-ms-exchange-generated-message-source').length > 0) return 'AUTO_REPLY';
  const precedence = header(message, 'precedence').map((value) => value.toLowerCase());
  if (precedence.some((value) => ['bulk', 'junk', 'list', 'auto_reply'].includes(value))) return 'MAILING_LIST';
  if (header(message, 'list-id').length > 0 || header(message, 'list-unsubscribe').length > 0) return 'MAILING_LIST';
  const returnPath = header(message, 'return-path');
  if (returnPath.some((value) => value === '<>' || value === '')) return 'BOUNCE';
  if (bounceSenders.test(from)) return 'BOUNCE';
  const contentType = header(message, 'content-type').join(' ').toLowerCase();
  if (contentType.includes('multipart/report')) return 'BOUNCE';
  if (autoSubjects.some((pattern) => pattern.test(message.subject))) return 'AUTO_REPLY';
  return null;
}
