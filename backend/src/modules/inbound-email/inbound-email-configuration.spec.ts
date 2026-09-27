import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { loadInboundEmailConfiguration } from './inbound-email-configuration';

describe('loadInboundEmailConfiguration', () => {
  it('reads secrets through getSecretForInternalUse (getSetting rejects them)', async () => {
    const secrets: Record<string, string> = {
      [settingKeys.privateInboundImapPassword]: 'abcdabcdabcdabcd',
      [settingKeys.privateInboundGraphClientSecret]: 'graph-secret',
    };
    const settings = {
      getSetting: jest.fn(async (key: string) => {
        if (key in secrets) throw new Error(`Secret setting ${key} must be read via getSecretForInternalUse`);
        return key === settingKeys.privateInboundProvider ? 'imap' : undefined;
      }),
      getSecretForInternalUse: jest.fn(async (key: string) => secrets[key]),
    } as unknown as SettingsService;
    const configuration = await loadInboundEmailConfiguration(settings);
    expect(configuration.imap.password).toBe('abcdabcdabcdabcd');
    expect(configuration.graph.clientSecret).toBe('graph-secret');
  });
});
