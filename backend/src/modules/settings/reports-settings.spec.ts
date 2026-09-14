import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';
import { defaultBottleneckWindowDays } from './definitions/reports-settings';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('reports settings', () => {
  it('defaults report packs and bottleneck window on', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REGISTRY,
          useValue: createSettingsRegistry(applicationSettings),
        },
        {
          provide: PrismaService,
          useValue: { appSetting: { findUnique: jest.fn().mockResolvedValue(null) } },
        },
      ],
    }).compile();
    const service = moduleRef.get(SettingsService);
    expect(await service.getSetting(settingKeys.privateReportsEnabled)).toBe(
      true,
    );
    expect(
      await service.getSetting(settingKeys.privateReportsExportFormatsCsv),
    ).toBe('csv,json');
    expect(
      await service.getSetting(settingKeys.privateDashboardBottlenecksEnabled),
    ).toBe(true);
    expect(
      await service.getSetting(
        settingKeys.privateDashboardBottlenecksDefaultWindowDays,
      ),
    ).toBe(defaultBottleneckWindowDays);
  });
});
