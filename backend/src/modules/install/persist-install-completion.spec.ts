import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { settingKeys } from '../settings/setting-keys';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import { installCompleteConstants } from './install-complete.constants';
import {
  persistInstallCompletion,
  type InstallCompletionPrisma,
} from './persist-install-completion';

const firstCompletedAt = '2026-09-11T10:00:00.000Z';
const secondCompletedAt = '2026-09-11T11:00:00.000Z';

describe('persistInstallCompletion', () => {
  const registry = createSettingsRegistry(applicationSettings);

  it('persists completedAt and writes one install_wizard change log', async () => {
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
    expect(memory.changeLogs).toHaveLength(1);
    expect(memory.changeLogs[0]).toMatchObject({
      entityType: changeLogEntityTypes.setting,
      entityId: settingKeys.privateInstallCompletedAt,
      reason: installCompleteConstants.changeLogReason,
      actorUserId: 'admin-1',
    });
    expect(memory.changeLogs[0]?.diff.before).toEqual({
      key: settingKeys.privateInstallCompletedAt,
      visibility: 'private',
      value: '',
    });
    expect(memory.changeLogs[0]?.diff.after).toEqual({
      key: settingKeys.privateInstallCompletedAt,
      visibility: 'private',
      value: firstCompletedAt,
    });
    expect(memory.changeLogs[0]?.diff.changes).toEqual([
      { path: 'value', before: '', after: firstCompletedAt },
    ]);
    expect(JSON.stringify(memory.changeLogs[0]?.diff)).toBe(
      JSON.stringify(JSON.parse(JSON.stringify(memory.changeLogs[0]?.diff))),
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
    expect(memory.changeLogs).toHaveLength(1);
  });
});
