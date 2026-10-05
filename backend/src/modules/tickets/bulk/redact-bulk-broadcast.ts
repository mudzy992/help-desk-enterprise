import { defaultTicketRedactionConfiguration } from '../redaction/redaction.constants';
import { redactSensitiveText } from '../redaction/redact-sensitive-text';
import { scanTicketContent } from '../redaction/assert-ticket-content-redaction';
import type {
  RedactionScanResult,
  TicketRedactionConfiguration,
} from '../redaction/redaction.types';
import type { BulkBroadcastParts } from './format-bulk-broadcast-message';

/**
 * Val 2 (M12/B2): every other ticket message passes redaction
 * (`createTicketMessage`) and every other e-mail passes `redactForEmail`, but
 * the bulk broadcast wrote its text straight to the message table and to the
 * e-mail channel. An administrator who copied a sample of a secret from a
 * ticket into a broadcast sent it to the whole group and the requester.
 *
 * The mail path redacts unconditionally, so the broadcast uses the very same
 * configuration (built-in patterns, `enabled: true`) instead of the
 * installation's warn-only setting.
 */
export const broadcastRedactionConfiguration = {
  ...defaultTicketRedactionConfiguration,
  enabled: true,
} as unknown as TicketRedactionConfiguration;

/** Result of scanning the formatted broadcast text for sensitive samples. */
export function scanBroadcastText(text: string): RedactionScanResult {
  return scanTicketContent({
    configuration: broadcastRedactionConfiguration,
    message: text,
  });
}

/** Replaces the sensitive samples found by `scanBroadcastText`. */
export function redactBroadcastText(text: string): string {
  return redactSensitiveText(text, broadcastRedactionConfiguration);
}

/**
 * M12/B5: the broadcast fields are redacted one by one before the text is
 * rendered for the ticket and for the e-mail, so both paths carry the same
 * redacted values while each can use its own language.
 */
export function redactBulkBroadcastParts(parts: BulkBroadcastParts): BulkBroadcastParts {
  return {
    whatHappened: redactBroadcastText(parts.whatHappened),
    whoAffected: redactBroadcastText(parts.whoAffected),
    eta: redactBroadcastText(parts.eta),
    workaround: parts.workaround === null ? null : redactBroadcastText(parts.workaround),
  };
}
