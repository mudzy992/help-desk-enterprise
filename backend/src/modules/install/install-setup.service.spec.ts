import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { InstallSetupService } from './install-setup.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('InstallSetupService', () => {
  const getSetting = jest.fn();
  const prisma = {} as unknown as import('../../common/prisma/prisma.service').PrismaService;
  const service = new InstallSetupService(
    { getSetting } as unknown as SettingsService,
    prisma,
  );

  beforeEach(() => {
    getSetting.mockReset();
  });

  it('reads only private.install.completedAt from the settings registry', async () => {
    getSetting.mockResolvedValue('');
    // getStatus consults prisma for wizard-step state; in this spec we only
    // validate that `isCompleted` flows through the settings service.
    await expect(service.isCompleted()).resolves.toBe(false);
    expect(getSetting).toHaveBeenCalledTimes(1);
    expect(getSetting).toHaveBeenCalledWith(
      settingKeys.privateInstallCompletedAt,
    );
  });

  it('reports completed setup from a valid ISO datetime', async () => {
    getSetting.mockResolvedValue('2026-09-11T08:00:00.000Z');
    await expect(service.isCompleted()).resolves.toBe(true);
  });

  it('fails closed when the settings registry cannot be read', async () => {
    getSetting.mockRejectedValue(new Error('settings unavailable'));
    // When settings cannot be read the setup gate must stay closed: the service
    // surfaces a setup-required exception so unauthenticated/setup endpoints
    // remain reachable but protected endpoints are blocked.
    await expect(service.isCompleted()).rejects.toMatchObject({
      message: expect.stringContaining('setup') as string,
    });
  });
});
