import { TicketsError } from '../tickets.error';
import type { ExecuteTicketBulkInput, TicketBulkConfiguration } from './bulk.types';

export function formatBulkBroadcastMessage(
  body: ExecuteTicketBulkInput,
  configuration: TicketBulkConfiguration,
): string {
  if (!configuration.broadcastEnableInApp && !configuration.broadcastEnableEmail) {
    throw new TicketsError('BULK_BROADCAST_INVALID');
  }
  const fields: Record<string, string | undefined> = {
    what_happened: body.whatHappened,
    who_affected: body.whoAffected,
    eta: body.eta,
  };
  if (configuration.broadcastStructuredEnabled) {
    for (const key of configuration.broadcastRequiredFields) {
      if ((fields[key] ?? '').trim().length === 0) {
        throw new TicketsError('BULK_BROADCAST_INVALID');
      }
    }
  }
  const workaround = configuration.broadcastAllowWorkaround
    ? body.workaround?.trim() ?? ''
    : '';
  const text = [
    `What happened: ${(body.whatHappened ?? '').trim()}`,
    `Who is affected: ${(body.whoAffected ?? '').trim()}`,
    `ETA: ${(body.eta ?? '').trim()}`,
    workaround.length > 0 ? `Workaround: ${workaround}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  if (!configuration.broadcastAllowLinks && containsLink(text)) {
    throw new TicketsError('BULK_BROADCAST_INVALID');
  }
  if (text.trim().length === 0) {
    throw new TicketsError('BULK_BROADCAST_INVALID');
  }
  return text;
}

function containsLink(value: string): boolean {
  return /https?:\/\//i.test(value) || /www\./i.test(value);
}
