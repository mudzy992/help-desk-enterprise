import {
  addonRequiresSmtp,
  addonSettingKey,
  installAddonCatalog,
  isInstallAddonKey,
} from './addon-catalog';

describe('installAddonCatalog', () => {
  it('matches the install-wizard specification keys and defaults', () => {
    expect(
      installAddonCatalog.map((item) => [item.key, item.defaultEnabled]),
    ).toEqual([
      ['sla', true],
      ['email', false],
      ['edge', false],
      ['teamsStub', false],
      ['csat', true],
      ['autoAssign', false],
      ['approvals', true],
      ['confidential', true],
      ['kbIntercept', true],
      ['timeTracking', true],
      ['ticketSplit', true],
      ['bulkActions', true],
      ['savedViews', true],
      ['reports', true],
      ['serviceDowntime', true],
    ]);
  });

  it('maps catalog keys to Settings Registry private.addons.<key> keys', () => {
    expect(addonSettingKey('email')).toBe('private.addons.email');
    expect(addonSettingKey('teamsStub')).toBe('private.addons.teamsStub');
    expect(isInstallAddonKey('sla')).toBe(true);
    expect(isInstallAddonKey('ticketing')).toBe(false);
  });

  it('requires SMTP only for the email addon', () => {
    expect(
      installAddonCatalog.filter(addonRequiresSmtp).map((item) => item.key),
    ).toEqual(['email']);
  });
});
