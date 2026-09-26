import { applicationSettings } from '../modules/settings/definitions/application-settings';
import { createSettingsRegistry } from '../modules/settings/registry/create-settings-registry';
import { planSettings } from './apply-settings';

jest.mock('../generated/prisma/client', () => ({ PrismaClient: jest.fn() }));

const registry = createSettingsRegistry(applicationSettings);
const resolve = (key: string) => registry.requireDefinition(key);

describe('planSettings', () => {
  it('validates the 1.8 test settings', () => {
    const plan = planSettings(
      {
        'private.auth.adLdapsUrlsCsv': 'ldaps://dc1.test.epbih.lab:636',
        'private.auth.adBindPassword': 'x',
        'private.auth.adRead.enabled': true,
        'private.auth.adRead.source': 'ldaps',
        'private.auth.adRead.maxDeactivationPercent': 10,
        'private.auth.roleSource': 'local_db',
      },
      resolve,
    );
    expect(plan).toHaveLength(6);
  });

  it('rejects everything when one key is unknown or invalid', () => {
    expect(() =>
      planSettings({ 'private.auth.adRead.source': 'ldaps', 'no.such.key': 1, 'private.auth.adRead.enabled': 'yes' }, resolve),
    ).toThrow(/no\.such\.key[\s\S]*adRead\.enabled/);
  });

  it('rejects non-object input', () => {
    expect(() => planSettings([], resolve)).toThrow();
  });
});
