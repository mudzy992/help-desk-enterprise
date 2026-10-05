/**
 * Paket 1.5: a bulk broadcast with e-mail on and in-app off has no ticket
 * message the e-mail fan-out could react to, so the bulk action hands the text
 * to this channel. The notifications module registers the sender at start-up
 * (same pattern as the SLA runtime channel — no circular module import).
 * With in-app on, the AGENT_REPLY it creates already produces the e-mail.
 */
import type { BulkBroadcastParts } from './format-bulk-broadcast-message';

export type BroadcastEmailRequest = {
  readonly ticketId: string;
  /**
   * M12/B5: the labelled fields (already redacted) instead of finished text —
   * the e-mail renders them in the recipient's language.
   */
  readonly parts: BulkBroadcastParts;
  readonly actorUserId: string | null;
  readonly batchId: string | null;
};

type BroadcastEmailSender = (request: BroadcastEmailRequest) => Promise<void>;

let registeredSender: BroadcastEmailSender | null = null;

export function registerBroadcastEmailSender(sender: BroadcastEmailSender): void {
  registeredSender = sender;
}

export function clearBroadcastEmailSender(): void {
  registeredSender = null;
}

export async function dispatchBroadcastEmail(request: BroadcastEmailRequest): Promise<void> {
  await registeredSender?.(request);
}
