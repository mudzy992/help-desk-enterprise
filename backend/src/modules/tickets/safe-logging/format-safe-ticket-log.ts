import { redactedContentPlaceholder } from '../redaction/redaction.constants';
import type { TicketRecord } from '../tickets.types';
import {
  alwaysRedactedLogKeys,
  defaultTicketSafeLoggingConfiguration,
  safeLogRedactedPlaceholder,
} from './safe-logging.constants';
import type {
  SafeTicketLogInput,
  TicketSafeLoggingConfiguration,
} from './safe-logging.types';

export function shouldApplySafeLogging(
  input: {
    readonly isConfidential?: boolean;
    readonly classification?: string;
  },
  configuration: TicketSafeLoggingConfiguration = defaultTicketSafeLoggingConfiguration,
): boolean {
  if (!configuration.enabled) {
    return false;
  }
  if (input.isConfidential === true) {
    return true;
  }
  if (input.classification === undefined) {
    return false;
  }
  return configuration.levels.includes(input.classification);
}

export function formatSafeTicketLog(
  input: SafeTicketLogInput,
  configuration: TicketSafeLoggingConfiguration = defaultTicketSafeLoggingConfiguration,
): Record<string, unknown> {
  const applyContentRedaction = shouldApplySafeLogging(input, configuration);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isAlwaysRedactedLogKey(key)) {
      output[key] = safeLogRedactedPlaceholder;
      continue;
    }
    if (applyContentRedaction && isContentLogKey(key, configuration)) {
      continue;
    }
    output[key] = value;
  }
  return output;
}

export function redactConfidentialSnapshotFields(
  record: TicketRecord,
  configuration: TicketSafeLoggingConfiguration = defaultTicketSafeLoggingConfiguration,
): Pick<TicketRecord, 'title' | 'description' | 'formData'> {
  if (!shouldApplySafeLogging(record, configuration)) {
    return {
      title: record.title,
      description: record.description,
      formData: record.formData,
    };
  }
  return {
    title: configuration.redactFields.includes('ticket_title')
      ? redactedContentPlaceholder
      : record.title,
    description: configuration.redactFields.includes('ticket_description')
      ? redactedContentPlaceholder
      : record.description,
    formData: redactedContentPlaceholder,
  };
}

function isAlwaysRedactedLogKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return alwaysRedactedLogKeys.some(
    (item) => item.toLowerCase() === normalized,
  );
}

function isContentLogKey(
  key: string,
  configuration: TicketSafeLoggingConfiguration,
): boolean {
  if (key === 'title' || key === 'ticket_title') {
    return configuration.redactFields.includes('ticket_title');
  }
  if (key === 'description' || key === 'ticket_description') {
    return configuration.redactFields.includes('ticket_description');
  }
  return (
    (key === 'body' || key === 'message' || key === 'chat_message') &&
    configuration.redactFields.includes('chat_message')
  );
}
