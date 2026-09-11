import { TicketsError } from '../tickets.error';
import { parseRequiredSettingCsv } from '../parse-setting-csv';
import { defaultTicketCloseCodesConfiguration } from './close-codes.constants';
import type { TicketCloseCodesConfiguration } from './close-codes.types';

export function parseTicketCloseCodesConfiguration(input: {
  readonly enabled: unknown;
  readonly allowedCodesCsv: unknown;
  readonly requireOnResolve: unknown;
}): TicketCloseCodesConfiguration {
  if (input.enabled === false) {
    return {
      ...defaultTicketCloseCodesConfiguration,
      enabled: false,
      allowedCodes: [...defaultTicketCloseCodesConfiguration.allowedCodes],
    };
  }
  if (input.enabled !== true || typeof input.requireOnResolve !== 'boolean') {
    throw new TicketsError('CLOSE_CODES_UNAVAILABLE');
  }
  let allowedCodes: readonly string[];
  try {
    allowedCodes = parseRequiredSettingCsv(input.allowedCodesCsv);
  } catch {
    throw new TicketsError('CLOSE_CODES_UNAVAILABLE');
  }
  if (allowedCodes.length === 0) {
    throw new TicketsError('CLOSE_CODES_UNAVAILABLE');
  }
  return {
    enabled: true,
    allowedCodes,
    requireOnResolve: input.requireOnResolve,
  };
}
