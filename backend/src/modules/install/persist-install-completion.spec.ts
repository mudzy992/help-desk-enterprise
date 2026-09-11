import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { settingKeys } from '../settings/setting-keys';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import { redactedSecretPlaceholder } from '../settings/settings.redaction';
import { authenticationConstants } from '../authentication/authentication.constants';
import { installCompleteConstants } from './install-complete.constants';
import type { InstallCompletionPrisma } from './install-complete.types';
import { persistInstallCompletion } from './persist-install-completion';

const firstCompletedAt = '2026-09-11T10:00:00.000Z';
const secondCompletedAt = '2026-09-11T11:00:00.000Z';

describe('persistInstallCompletion', () => {
  const registry = createSettingsRegistry(applicationSettings);

  it('persists completedAt, provisions a JWT signing secret, and writes install_wizard change logs', async () => {
    const memory = createInMemorySettingsPrisma();
    const prisma = memory.prisma as unknown as InstallCompletionPrisma;
    const result = await persistInstallCompletion(prisma, registry, {
      actorUserId: 'admin-1',
      completedAt: firstCompletedAt,
      reason: installCompleteConstants.changeLogReason,
    });
    expect(result).toEqual({
      completedAt: firstCompletedAt,
      alreadyCompleted: false,
    });
    expect(
      memory.getStored(settingKeys.privateInstallCompletedAt),
    ).toMatchObject({ value: firstCompletedAt, isSecret: false });
    expect(
      memory.getStored(settingKeys.privateInstallCompletedByUserId),
    ).toMatchObject({ value: 'admin-1' });
    const jwtSecret = memory.getStored(settingKeys.privateAuthJwtSigningSecret);
    expect(typeof jwtSecret?.value).toBe('string');
    expect(String(jwtSecret?.value).length).toBeGreaterThanOrEqual(
      authenticationConstants.minimumJwtSigningSecretLength,
    );
    expect(jwtSecret).toMatchObject({ isSecret: true });
    const completedAtLog = memory.changeLogs.find(
      (entry) => entry.entityId === settingKeys.privateInstallCompletedAt,
    );
    const jwtLog = memory.changeLogs.find(
      (entry) => entry.entityId === settingKeys.privateAuthJwtSigningSecret,
    );
    expect(memory.changeLogs).toHaveLength(2);
    expect(completedAtLog).toMatchObject({
      entityType: changeLogEntityTypes.setting,
      entityId: settingKeys.privateInstallCompletedAt,
      reason: installCompleteConstants.changeLogReason,
      actorUserId: 'admin-1',
    });
    expect(completedAtLog?.diff.before).toEqual({
      key: settingKeys.privateInstallCompletedAt,
      visibility: 'private',
      value: '',
    });
    expect(completedAtLog?.diff.after).toEqual({
      key: settingKeys.privateInstallCompletedAt,
      visibility: 'private',
      value: firstCompletedAt,
    });
    expect(completedAtLog?.diff.changes).toEqual([
      { path: 'value', before: '', after: firstCompletedAt },
    ]);
    expect(jwtLog?.diff.after).toMatchObject({
      key: settingKeys.privateAuthJwtSigningSecret,
      visibility: 'secret',
      value: redactedSecretPlaceholder,
    });
    expect(JSON.stringify(memory.changeLogs)).not.toContain(
      String(jwtSecret?.value),
    );
    expect(JSON.stringify(completedAtLog?.diff)).toBe(
      JSON.stringify(JSON.parse(JSON.stringify(completedAtLog?.diff))),
    );
  });

  it('is idempotent and never overwrites an existing completion timestamp', async () => {
    const memory = createInMemorySettingsPrisma();
    const prisma = memory.prisma as unknown as InstallCompletionPrisma;
    await persistInstallCompletion(prisma, registry, {
      actorUserId: 'admin-1',
      completedAt: firstCompletedAt,
      reason: installCompleteConstants.changeLogReason,
    });
    const jwtSecret = memory.getStored(
      settingKeys.privateAuthJwtSigningSecret,
    )?.value;
    const retry = await persistInstallCompletion(prisma, registry, {
      actorUserId: 'admin-2',
      completedAt: secondCompletedAt,
      reason: installCompleteConstants.changeLogReason,
    });
    expect(retry).toEqual({
      completedAt: firstCompletedAt,
      alreadyCompleted: true,
    });
    expect(
      memory.getStored(settingKeys.privateInstallCompletedAt)?.value,
    ).toBe(firstCompletedAt);
    expect(
      memory.getStored(settingKeys.privateInstallCompletedByUserId)?.value,
    ).toBe('admin-1');
    expect(memory.changeLogs).toHaveLength(2);
    expect(
      memory.getStored(settingKeys.privateAuthJwtSigningSecret)?.value,
    ).toBe(jwtSecret);
  });

  it('provisions a JWT signing secret for an already completed install', async () => {
    const memory = createInMemorySettingsPrisma();
    const prisma = memory.prisma as unknown as InstallCompletionPrisma;
    const completedAtDefinition = registry.requireDefinition(
      settingKeys.privateInstallCompletedAt,
    );
    await memory.prisma.appSetting.upsert({
      where: { key: completedAtDefinition.key },
      create: {
        key: completedAtDefinition.key,
        value: firstCompletedAt,
        scope: 'PRIVATE',
        isSecret: false,
        description: completedAtDefinition.description,
      },
      update: {
        value: firstCompletedAt,
        scope: 'PRIVATE',
        isSecret: false,
        description: completedAtDefinition.description,
      },
    });
    const result = await persistInstallCompletion(prisma, registry, {
      actorUserId: 'admin-1',
      completedAt: secondCompletedAt,
      reason: installCompleteConstants.changeLogReason,
    });
    expect(result).toEqual({
      completedAt: firstCompletedAt,
      alreadyCompleted: true,
    });
    const jwtSecret = memory.getStored(settingKeys.privateAuthJwtSigningSecret);
    expect(typeof jwtSecret?.value).toBe('string');
    expect(String(jwtSecret?.value).length).toBeGreaterThanOrEqual(
      authenticationConstants.minimumJwtSigningSecretLength,
    );
  });
});
