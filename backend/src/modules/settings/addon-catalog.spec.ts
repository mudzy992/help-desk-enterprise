import {
  addonRequiresSmtp,
  addonSettingKey,
  installAddonCatalog,
  isInstallAddonKey,
} from './addon-catalog';

describe('installAddonCatalog', () => {
  it('offers only addons some code reads, with their defaults', () => {
    expect(
      installAddonCatalog.map((item) => [item.key, item.defaultEnabled]),
    ).toEqual([
      ['email', false],
      ['edge', false],
      ['csat', true],
      ['approvals', true],
      ['confidential', true],
      ['kbIntercept', true],
      ['ticketSplit', true],
      ['bulkActions', true],
      ['savedViews', true],
      ['reports', true],
      ['cmdb', false],
      ['problems', false],
      ['changes', false],
      ['teams', false],
    ]);
  });

  it('maps catalog keys to Settings Registry private.addons.<key> keys', () => {
    expect(addonSettingKey('email')).toBe('private.addons.email');
    expect(addonSettingKey('teams')).toBe('private.addons.teams');
    expect(isInstallAddonKey('csat')).toBe(true);
    expect(isInstallAddonKey('ticketing')).toBe(false);
  });

  it('requires SMTP only for the email addon', () => {
    expect(
      installAddonCatalog.filter(addonRequiresSmtp).map((item) => item.key),
    ).toEqual(['email']);
  });
});
