import { parseTicketConfidentialConfiguration } from './parse-ticket-confidential-configuration';

describe('parseTicketConfidentialConfiguration', () => {
  it('disables ACL when the addon or feature flag is off', () => {
    expect(
      parseTicketConfidentialConfiguration({
        addonEnabled: false,
        enabled: true,
        defaultForServicesCsv: '',
        allowedViewerRolesCsv: '',
        allowedViewerGroupIdsCsv: '',
        breakGlassEnabled: true,
        breakGlassAllowedRolesCsv: 'SUPER_ADMIN',
        breakGlassRequiresReason: true,
        auditViews: true,
      }).enabled,
    ).toBe(false);
  });

  it('parses allow-lists and break-glass settings', () => {
    const parsed = parseTicketConfidentialConfiguration({
      addonEnabled: true,
      enabled: true,
      defaultForServicesCsv: 'service-hr',
      allowedViewerRolesCsv: 'ADMIN',
      allowedViewerGroupIdsCsv: 'group-legal',
      breakGlassEnabled: true,
      breakGlassAllowedRolesCsv: 'SUPER_ADMIN,ADMIN',
      breakGlassRequiresReason: true,
      auditViews: true,
    });
    expect(parsed.defaultForServiceIds).toEqual(['service-hr']);
    expect(parsed.allowedViewerRoles).toEqual(['ADMIN']);
    expect(parsed.breakGlassAllowedRoles).toEqual(['SUPER_ADMIN', 'ADMIN']);
  });
});
