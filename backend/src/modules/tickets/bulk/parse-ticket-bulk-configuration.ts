import { parseCsvTokens } from '../../authorization/parse-csv-tokens';
import { TicketsError } from '../tickets.error';
import { defaultTicketBulkConfiguration } from './bulk.constants';
import { ticketBulkActionTypes } from './bulk.types';
import type { TicketBulkActionType, TicketBulkConfiguration } from './bulk.types';

export function parseTicketBulkConfiguration(input: {
  readonly addonEnabled: unknown;
  readonly enabled: unknown;
  readonly allowCrossOuForSuperAdmin: unknown;
  readonly requireSameOuAndGroup: unknown;
  readonly disallowBulkClose: unknown;
  readonly allowedActionTypesCsv: unknown;
  readonly broadcastEnableInApp: unknown;
  readonly broadcastEnableEmail: unknown;
  readonly broadcastRequirePreview: unknown;
  readonly broadcastRateLimitPerMinute: unknown;
  readonly broadcastStructuredEnabled: unknown;
  readonly broadcastRequiredFieldsCsv: unknown;
  readonly broadcastAllowWorkaround: unknown;
  readonly broadcastAllowLinks: unknown;
  readonly auditBatchIdEnabled: unknown;
}): TicketBulkConfiguration {
  if (input.addonEnabled !== true || input.enabled !== true) {
    return { ...defaultTicketBulkConfiguration, enabled: false };
  }
  if (
    typeof input.allowCrossOuForSuperAdmin !== 'boolean' ||
    typeof input.requireSameOuAndGroup !== 'boolean' ||
    typeof input.disallowBulkClose !== 'boolean' ||
    typeof input.allowedActionTypesCsv !== 'string' ||
    typeof input.broadcastEnableInApp !== 'boolean' ||
    typeof input.broadcastEnableEmail !== 'boolean' ||
    typeof input.broadcastRequirePreview !== 'boolean' ||
    typeof input.broadcastRateLimitPerMinute !== 'number' ||
    !Number.isFinite(input.broadcastRateLimitPerMinute) ||
    input.broadcastRateLimitPerMinute <= 0 ||
    typeof input.broadcastStructuredEnabled !== 'boolean' ||
    typeof input.broadcastRequiredFieldsCsv !== 'string' ||
    typeof input.broadcastAllowWorkaround !== 'boolean' ||
    typeof input.broadcastAllowLinks !== 'boolean' ||
    typeof input.auditBatchIdEnabled !== 'boolean'
  ) {
    throw new TicketsError('BULK_UNAVAILABLE');
  }
  return {
    enabled: true,
    allowCrossOuForSuperAdmin: input.allowCrossOuForSuperAdmin,
    requireSameOuAndGroup: input.requireSameOuAndGroup,
    disallowBulkClose: true,
    allowedActionTypes: parseActionTypes(input.allowedActionTypesCsv),
    broadcastEnableInApp: input.broadcastEnableInApp,
    broadcastEnableEmail: input.broadcastEnableEmail,
    broadcastRequirePreview: input.broadcastRequirePreview,
    broadcastRateLimitPerMinute: input.broadcastRateLimitPerMinute,
    broadcastStructuredEnabled: input.broadcastStructuredEnabled,
    broadcastRequiredFields: parseCsvTokens(input.broadcastRequiredFieldsCsv),
    broadcastAllowWorkaround: input.broadcastAllowWorkaround,
    broadcastAllowLinks: input.broadcastAllowLinks,
    auditBatchIdEnabled: input.auditBatchIdEnabled,
  };
}

function parseActionTypes(value: string): readonly TicketBulkActionType[] {
  const parsed = parseCsvTokens(value).filter((item): item is TicketBulkActionType =>
    ticketBulkActionTypes.includes(item as TicketBulkActionType),
  );
  return parsed.length > 0
    ? parsed
    : defaultTicketBulkConfiguration.allowedActionTypes;
}
