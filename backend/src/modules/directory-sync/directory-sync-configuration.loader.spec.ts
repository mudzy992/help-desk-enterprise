import { settingKeys } from '../settings/setting-keys';
import { DirectorySyncConfigurationLoader } from './directory-sync-configuration.loader';
import { DirectorySyncError } from './directory-sync.error';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('DirectorySyncConfigurationLoader', () => {
  const getSetting = jest.fn();
  const loader = new DirectorySyncConfigurationLoader({ getSetting } as never);

  beforeEach(() => {
    getSetting.mockReset();
    getSetting.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        [settingKeys.privateAuthAdReadEnabled]: true,
        [settingKeys.privateAuthAdReadStrategy]: 'manual_only',
        [settingKeys.privateAuthAdReadUsersBaseDn]: 'OU=Users,DC=example,DC=com',
        [settingKeys.privateAuthAdReadGroupsBaseDn]:
          'OU=Groups,DC=example,DC=com',
        [settingKeys.privateAuthAdReadMaxQueriesPerSecond]: 0.5,
        [settingKeys.privateAuthAdReadCacheTtlMinutes]: 30,
        [settingKeys.privateAuthAdReadOuTreeCacheTtlHours]: 12,
        [settingKeys.privateAuthMode]: 'entra_ad',
      };
      return Promise.resolve(values[key]);
    });
  });

  it('loads directory-sync settings without reading authentication mode', async () => {
    await expect(loader.load()).resolves.toMatchObject({
      enabled: true,
      strategy: 'manual_only',
      maxQueriesPerSecond: 0.5,
    });
    const requestedKeys = getSetting.mock.calls.map((call) => call[0]);
    expect(requestedKeys).not.toContain(settingKeys.privateAuthMode);
    expect(requestedKeys).toContain(settingKeys.privateAuthAdReadStrategy);
  });

  it('fails closed when settings cannot be parsed', async () => {
    getSetting.mockRejectedValue(new Error('settings unavailable'));
    await expect(loader.load()).rejects.toThrow(
      new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE'),
    );
  });
});
