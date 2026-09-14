import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('audit log settings', () => {
  it('defaults export and tamper-evident flags on with csv,json and sha256', async () => {
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
    expect(await service.getSetting(settingKeys.privateAuditExportEnabled)).toBe(
      true,
    );
    expect(
      await service.getSetting(settingKeys.privateAuditExportAllowedFormatsCsv),
    ).toBe('csv,json');
    expect(
      await service.getSetting(settingKeys.privateAuditTamperEvidentEnabled),
    ).toBe(true);
    expect(
      await service.getSetting(settingKeys.privateAuditTamperEvidentHashAlgorithm),
    ).toBe('sha256');
  });
});
