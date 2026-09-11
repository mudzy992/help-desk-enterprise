import { TicketsError } from '../tickets.error';
import { parseRequiredSettingCsv } from '../parse-setting-csv';
import {
  defaultTicketSafeLoggingConfiguration,
  safeLoggingFieldKeys,
  type SafeLoggingFieldKey,
} from './safe-logging.constants';
import type { TicketSafeLoggingConfiguration } from './safe-logging.types';

export function parseTicketSafeLoggingConfiguration(input: {
  readonly enabled: unknown;
  readonly levelsCsv: unknown;
  readonly redactFieldsCsv: unknown;
}): TicketSafeLoggingConfiguration {
  if (input.enabled === false) {
    return {
      ...defaultTicketSafeLoggingConfiguration,
      enabled: false,
      levels: [...defaultTicketSafeLoggingConfiguration.levels],
      redactFields: [...defaultTicketSafeLoggingConfiguration.redactFields],
    };
  }
  if (input.enabled !== true) {
    throw new TicketsError('CONFIDENTIAL_UNAVAILABLE');
  }
  let levels: readonly string[];
  let redactFieldsRaw: readonly string[];
  try {
    levels = parseRequiredSettingCsv(input.levelsCsv);
    redactFieldsRaw = parseRequiredSettingCsv(input.redactFieldsCsv);
  } catch {
    throw new TicketsError('CONFIDENTIAL_UNAVAILABLE');
  }
  const redactFields = redactFieldsRaw.filter(
    (item): item is SafeLoggingFieldKey =>
      safeLoggingFieldKeys.includes(item as SafeLoggingFieldKey),
  );
  if (levels.length === 0 || redactFields.length === 0) {
    throw new TicketsError('CONFIDENTIAL_UNAVAILABLE');
  }
  return {
    enabled: true,
    levels,
    redactFields,
  };
}
