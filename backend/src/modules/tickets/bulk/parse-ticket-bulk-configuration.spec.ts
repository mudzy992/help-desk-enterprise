import { parseTicketBulkConfiguration } from './parse-ticket-bulk-configuration';

describe('parseTicketBulkConfiguration', () => {
  const valid = {
    addonEnabled: true,
    enabled: true,
    allowCrossOuForSuperAdmin: true,
    requireSameOuAndGroup: true,
    disallowBulkClose: false,
    allowedActionTypesCsv: 'assign_group,set_status,close',
    broadcastEnableInApp: true,
    broadcastEnableEmail: false,
    broadcastRequirePreview: true,
    broadcastRateLimitPerMinute: 5,
    broadcastStructuredEnabled: true,
    broadcastRequiredFieldsCsv: 'what_happened,who_affected,eta',
    broadcastAllowWorkaround: true,
    broadcastAllowLinks: false,
    auditBatchIdEnabled: true,
  };

  it('keeps bulk close forbidden even when the stored flag is off', () => {
    const parsed = parseTicketBulkConfiguration(valid);
    expect(parsed.disallowBulkClose).toBe(true);
    expect(parsed.allowedActionTypes).toEqual(['assign_group', 'set_status']);
  });

  it('disables bulk when the addon is off', () => {
    expect(
      parseTicketBulkConfiguration({ ...valid, addonEnabled: false }).enabled,
    ).toBe(false);
  });
});
