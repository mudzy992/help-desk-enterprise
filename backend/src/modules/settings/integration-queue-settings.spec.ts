import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemorySettingsPrisma } from './create-in-memory-settings-prisma';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('integration queue settings', () => {
  it('defaults the durable queue on with RAW retry values', async () => {
    const memory = createInMemorySettingsPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REGISTRY,
          useValue: createSettingsRegistry(applicationSettings),
        },
        { provide: PrismaService, useValue: memory.prisma },
      ],
    }).compile();
    const service = moduleRef.get(SettingsService);
    expect(
      await service.getSetting(settingKeys.privateIntegrationsQueueEnabled),
    ).toBe(true);
    expect(
      await service.getSetting(settingKeys.privateIntegrationsQueueTypesCsv),
    ).toBe('email,edge,teams');
    expect(
      await service.getSetting(settingKeys.privateIntegrationsQueueMaxAttempts),
    ).toBe(10);
    expect(
      await service.getSetting(
        settingKeys.privateIntegrationsQueueInitialBackoffSeconds,
      ),
    ).toBe(60);
    expect(
      await service.getSetting(
        settingKeys.privateIntegrationsQueueAdminUiEnabled,
      ),
    ).toBe(true);
  });
});
