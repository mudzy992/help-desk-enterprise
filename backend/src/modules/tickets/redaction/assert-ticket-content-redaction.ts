import { TicketsError } from '../tickets.error';
import {
  mergeRedactionScans,
  scanTextForRedaction,
} from './detect-sensitive-content';
import type { RedactionFieldKey } from './redaction.constants';
import type {
  RedactionScanResult,
  TicketRedactionConfiguration,
} from './redaction.types';

export function scanTicketContent(input: {
  readonly configuration: TicketRedactionConfiguration;
  readonly title?: string;
  readonly description?: string;
  readonly message?: string;
}): RedactionScanResult {
  const scans = [
    scanOptional('ticket_title', input.title, input.configuration),
    scanOptional('ticket_description', input.description, input.configuration),
    scanOptional('chat_message', input.message, input.configuration),
  ].filter((scan): scan is RedactionScanResult => scan !== null);
  return mergeRedactionScans(scans);
}

export function assertRedactionAllowed(result: RedactionScanResult): void {
  if (!result.blocked) {
    return;
  }
  throw new TicketsError('REDACTION_BLOCKED', 'REDACTION_BLOCKED', {
    fields: [...new Set(result.matches.map((match) => match.field))],
    patternIds: result.matches.map((match) => match.patternId),
  });
}

function scanOptional(
  field: RedactionFieldKey,
  value: string | undefined,
  configuration: TicketRedactionConfiguration,
): RedactionScanResult | null {
  if (value === undefined) {
    return null;
  }
  return scanTextForRedaction(field, value, configuration);
}
