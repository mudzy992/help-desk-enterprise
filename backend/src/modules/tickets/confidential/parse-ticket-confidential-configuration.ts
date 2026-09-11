import { TicketsError } from '../tickets.error';
import { parseSettingCsv } from '../parse-setting-csv';
import { defaultTicketConfidentialConfiguration } from './confidential.constants';
import type { TicketConfidentialConfiguration } from './confidential.types';

export function parseTicketConfidentialConfiguration(input: {
  readonly addonEnabled: unknown;
  readonly enabled: unknown;
  readonly defaultForServicesCsv: unknown;
  readonly allowedViewerRolesCsv: unknown;
  readonly allowedViewerGroupIdsCsv: unknown;
  readonly breakGlassEnabled: unknown;
  readonly breakGlassAllowedRolesCsv: unknown;
  readonly breakGlassRequiresReason: unknown;
  readonly auditViews: unknown;
}): TicketConfidentialConfiguration {
  if (input.addonEnabled !== true || input.enabled !== true) {
    return {
      ...defaultTicketConfidentialConfiguration,
      enabled: false,
      defaultForServiceIds: [],
      allowedViewerRoles: [],
      allowedViewerGroupIds: [],
      breakGlassAllowedRoles: [
        ...defaultTicketConfidentialConfiguration.breakGlassAllowedRoles,
      ],
    };
  }
  if (
    typeof input.breakGlassEnabled !== 'boolean' ||
    typeof input.breakGlassRequiresReason !== 'boolean' ||
    typeof input.auditViews !== 'boolean'
  ) {
    throw new TicketsError('CONFIDENTIAL_UNAVAILABLE');
  }
  const breakGlassAllowedRoles = parseSettingCsv(
    input.breakGlassAllowedRolesCsv,
  );
  if (breakGlassAllowedRoles.length === 0) {
    throw new TicketsError('CONFIDENTIAL_UNAVAILABLE');
  }
  return {
    enabled: true,
    defaultForServiceIds: parseSettingCsv(input.defaultForServicesCsv),
    allowedViewerRoles: parseSettingCsv(input.allowedViewerRolesCsv),
    allowedViewerGroupIds: parseSettingCsv(input.allowedViewerGroupIdsCsv),
    breakGlassEnabled: input.breakGlassEnabled,
    breakGlassAllowedRoles,
    breakGlassRequiresReason: input.breakGlassRequiresReason,
    auditViews: input.auditViews,
  };
}
