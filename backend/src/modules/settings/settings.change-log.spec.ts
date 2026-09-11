import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import { createInMemorySettingsPrisma } from './create-in-memory-settings-prisma';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { redactedSecretPlaceholder } from './settings.redaction';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsError, settingsErrorCodes } from './settings.error';
import { SettingsService } from './settings.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SettingsService change log', () => {
  const createHarness = async () => {
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
    return { service: moduleRef.get(SettingsService), memory };
  };

  it('records actor, resource, before/after, and a deterministic diff', async () => {
    const { service, memory } = await createHarness();
    await service.setSettingValue(settingKeys.privateAuthMode, 'entra_ad', {
      reason: 'Switch authentication provider',
      actorUserId: 'admin-1',
    });
    expect(memory.changeLogs).toHaveLength(1);
    const entry = memory.changeLogs[0];
    expect(entry).toMatchObject({
      entityType: changeLogEntityTypes.setting,
      entityId: settingKeys.privateAuthMode,
      reason: 'Switch authentication provider',
      actorUserId: 'admin-1',
    });
    expect(entry.diff.before).toEqual({
      key: settingKeys.privateAuthMode,
      visibility: 'private',
      value: 'local',
    });
    expect(entry.diff.after).toEqual({
      key: settingKeys.privateAuthMode,
      visibility: 'private',
      value: 'entra_ad',
    });
    expect(entry.diff.changes).toEqual([
      { path: 'value', before: 'local', after: 'entra_ad' },
    ]);
    expect(JSON.stringify(entry.diff)).toBe(
      JSON.stringify(JSON.parse(JSON.stringify(entry.diff))),
    );
  });

  it('requires a reason and does not log failed mutations', async () => {
    const { service, memory } = await createHarness();
    await expect(
      service.setSettingValue(settingKeys.privateAuthMode, 'entra_ad', {
        reason: '   ',
        actorUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({
      code: settingsErrorCodes.reasonRequired,
    });
    await expect(
      service.setSettingValue(settingKeys.privateAuthMode, 12 as never, {
        reason: 'Invalid type',
        actorUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(SettingsError);
    expect(memory.changeLogs).toEqual([]);
  });

  it('redacts secret values in the change log', async () => {
    const { service, memory } = await createHarness();
    await service.setSettingValue(
      settingKeys.privateAuthJwtSigningSecret,
      'plaintext-secret',
      { reason: 'Rotate JWT signing secret', actorUserId: 'admin-1' },
    );
    const entry = memory.changeLogs[0];
    expect(entry.diff.after).toEqual({
      key: settingKeys.privateAuthJwtSigningSecret,
      visibility: 'secret',
      value: redactedSecretPlaceholder,
    });
    expect(entry.diff.changes).toEqual([
      {
        path: 'value',
        before: null,
        after: redactedSecretPlaceholder,
      },
    ]);
    expect(JSON.stringify(memory.changeLogs)).not.toContain('plaintext-secret');
    expect(
      memory.getStored(settingKeys.privateAuthJwtSigningSecret),
    ).toMatchObject({
      isSecret: true,
      value: 'plaintext-secret',
    });
  });
});
