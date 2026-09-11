import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { InstallSetupService } from './install-setup.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('InstallSetupService', () => {
  const getSetting = jest.fn();
  const service = new InstallSetupService({
    getSetting,
  } as unknown as SettingsService);

  beforeEach(() => {
    getSetting.mockReset();
  });

  it('reads only private.install.completedAt from the settings registry', async () => {
    getSetting.mockResolvedValue('');
    await expect(service.getStatus()).resolves.toEqual({ isCompleted: false });
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
    await expect(service.isCompleted()).resolves.toBe(false);
    await expect(service.getStatus()).resolves.toEqual({ isCompleted: false });
  });
});
