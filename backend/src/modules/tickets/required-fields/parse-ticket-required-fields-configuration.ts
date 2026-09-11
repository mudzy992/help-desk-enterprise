import { TicketsError } from '../tickets.error';
import { parseRequiredSettingCsv } from '../parse-setting-csv';
import { defaultTicketRequiredFieldsConfiguration } from './required-fields.constants';
import type { TicketRequiredFieldsConfiguration } from './required-fields.types';

export function parseTicketRequiredFieldsConfiguration(input: {
  readonly enabled: unknown;
  readonly globalRequiredOnResolveCsv: unknown;
  readonly byServiceJson: unknown;
  readonly enforceSchemaRequiredFields: unknown;
}): TicketRequiredFieldsConfiguration {
  if (input.enabled === false) {
    return {
      ...defaultTicketRequiredFieldsConfiguration,
      enabled: false,
      globalRequiredOnResolve: [
        ...defaultTicketRequiredFieldsConfiguration.globalRequiredOnResolve,
      ],
      byService: {},
    };
  }
  if (
    input.enabled !== true ||
    typeof input.enforceSchemaRequiredFields !== 'boolean'
  ) {
    throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
  }
  let globalRequiredOnResolve: readonly string[];
  try {
    globalRequiredOnResolve = parseRequiredSettingCsv(
      input.globalRequiredOnResolveCsv,
    );
  } catch {
    throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
  }
  return {
    enabled: true,
    globalRequiredOnResolve,
    byService: parseByServiceJson(input.byServiceJson),
    enforceSchemaRequiredFields: input.enforceSchemaRequiredFields,
  };
}

function parseByServiceJson(
  value: unknown,
): Readonly<Record<string, readonly string[]>> {
  if (value === undefined || value === null || value === '') {
    return {};
  }
  if (typeof value !== 'string') {
    throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
  }
  const byService: Record<string, readonly string[]> = {};
  for (const [serviceId, fields] of Object.entries(parsed)) {
    if (serviceId.trim().length === 0 || !Array.isArray(fields)) {
      throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
    }
    const keys = fields.filter((item): item is string => typeof item === 'string');
    if (keys.length !== fields.length) {
      throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
    }
    byService[serviceId] = keys.map((item) => item.trim()).filter(Boolean);
  }
  return byService;
}
