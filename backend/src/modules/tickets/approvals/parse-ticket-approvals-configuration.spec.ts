import { parseTicketApprovalsConfiguration } from './parse-ticket-approvals-configuration';

describe('parseTicketApprovalsConfiguration', () => {
  it('disables when the addon or feature flag is off', () => {
    expect(
      parseTicketApprovalsConfiguration({
        addonEnabled: false,
        enabled: true,
        requiredByServiceJson: '{"svc":true}',
        defaultApproverRole: 'ADMIN',
      }).enabled,
    ).toBe(false);
  });

  it('parses boolean and object service overlays', () => {
    const parsed = parseTicketApprovalsConfiguration({
      addonEnabled: true,
      enabled: true,
      requiredByServiceJson: '{"a":true,"b":{"required":false}}',
      defaultApproverRole: 'AGENT',
    });
    expect(parsed.requiredByService).toEqual({ a: true, b: false });
    expect(parsed.defaultApproverRole).toBe('AGENT');
  });

  it('rejects invalid JSON and roles', () => {
    expect(() =>
      parseTicketApprovalsConfiguration({
        addonEnabled: true,
        enabled: true,
        requiredByServiceJson: '{',
        defaultApproverRole: 'ADMIN',
      }),
    ).toThrow('APPROVALS_UNAVAILABLE');
    expect(() =>
      parseTicketApprovalsConfiguration({
        addonEnabled: true,
        enabled: true,
        requiredByServiceJson: '{}',
        defaultApproverRole: 'USER',
      }),
    ).toThrow('APPROVALS_UNAVAILABLE');
  });
});
