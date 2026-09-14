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

describe('teams integration settings', () => {
  it('defaults the Teams stub off with an empty event list', async () => {
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
      await service.getSetting(settingKeys.privateIntegrationsTeamsStubEnabled),
    ).toBe(false);
    expect(
      await service.getSetting(
        settingKeys.privateIntegrationsTeamsEventTypesCsv,
      ),
    ).toBe('');
    await expect(
      service.getSetting(settingKeys.privateIntegrationsTeamsWebhookUrl),
    ).rejects.toThrow(/getSecretForInternalUse/);
    expect(
      await service.getSecretForInternalUse(
        settingKeys.privateIntegrationsTeamsWebhookUrl,
      ),
    ).toBeUndefined();
  });
});
