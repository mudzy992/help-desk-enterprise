import { parseTicketApprovalsConfiguration } from './parse-ticket-approvals-configuration';

describe('parseTicketApprovalsConfiguration', () => {
  it('disables when the addon or feature flag is off', () => {
    expect(
      parseTicketApprovalsConfiguration({
        addonEnabled: false,
        enabled: true,
        requiredByServiceJson: '{"svc":true}',
        defaultApproverRole: 'ADMIN',
        allowRequesterManager: false,
      }).enabled,
    ).toBe(false);
  });

  it('parses boolean and object service overlays', () => {
    const parsed = parseTicketApprovalsConfiguration({
      addonEnabled: true,
      enabled: true,
      requiredByServiceJson: '{"a":true,"b":{"required":false}}',
      defaultApproverRole: 'AGENT',
      allowRequesterManager: true,
    });
    expect(parsed.requiredByService).toEqual({ a: true, b: false });
    expect(parsed.defaultApproverRole).toBe('AGENT');
    expect(parsed.allowRequesterManager).toBe(true);
  });

  it('rejects invalid JSON and roles', () => {
    expect(() =>
      parseTicketApprovalsConfiguration({
        addonEnabled: true,
        enabled: true,
        requiredByServiceJson: '{',
        defaultApproverRole: 'ADMIN',
        allowRequesterManager: false,
      }),
    ).toThrow('APPROVALS_UNAVAILABLE');
    expect(() =>
      parseTicketApprovalsConfiguration({
        addonEnabled: true,
        enabled: true,
        requiredByServiceJson: '{}',
        defaultApproverRole: 'USER',
        allowRequesterManager: false,
      }),
    ).toThrow('APPROVALS_UNAVAILABLE');
  });
});
