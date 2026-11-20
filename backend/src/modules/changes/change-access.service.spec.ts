import { Logger } from '@nestjs/common';
import { assetViewerFromContext, resolveAssetScope } from '../assets/asset-viewer';
import { changeDefaults } from '../settings/definitions/change-settings';
import { ChangeAccessService } from './change-access.service';

function setup(options: { addon?: boolean; groups?: number; member?: boolean } = {}) {
  const prisma = {
    group: { count: jest.fn(async () => options.groups ?? 1) },
    groupMember: { count: jest.fn(async () => (options.member ? 1 : 0)) },
  };
  const settings = { getSetting: jest.fn(async () => options.addon ?? true) };
  return new ChangeAccessService(prisma as never, settings as never);
}

const viewer = (roleKey: string, permissions: string[], ou: { id: string; path: string } | null = { id: 'ou-a', path: '/a' }) =>
  assetViewerFromContext(
    {
      roleKeys: [roleKey],
      homeOrganizationalUnitId: null,
      assignments: [{
        roleKey,
        permissionKeys: permissions,
        scope: ou
          ? { kind: 'organizational-unit', organizationalUnitId: ou.id, organizationalUnitPath: ou.path }
          : { kind: 'global' },
        organizationalUnitId: ou?.id ?? null,
        organizationalUnitPath: ou?.path ?? null,
        serviceId: null,
      }],
    } as never,
    'u1',
    'change.',
  );

describe('ChangeAccessService (3.4)', () => {
  it('is active only with the addon on and at least one CAB group', async () => {
    expect(await setup({ groups: 0 }).isEnabled()).toBe(false);
    expect(await setup({ addon: false }).isEnabled()).toBe(false);
    expect(await setup().isEnabled()).toBe(true);
  });

  it('needs change.approve and CAB membership to vote; admins do not bypass membership', async () => {
    const manager = viewer('CHANGE_MANAGER', ['change.read', 'change.approve']);
    const admin = viewer('ADMIN', ['change.read', 'change.approve']);
    const agent = viewer('AGENT', ['change.read', 'change.request']);
    expect(await setup({ member: true }).isCabMember(manager, 'cab')).toBe(true);
    expect(await setup({ member: false }).isCabMember(admin, 'cab')).toBe(false);
    expect(await setup({ member: true }).isCabMember(agent, 'cab')).toBe(false);
    expect(await setup({ member: true }).isCabMember(manager, null)).toBe(false);
  });

  it('keeps CHANGE_MANAGER and scoped ADMIN grants inside their OU; a global manager is explicit', async () => {
    const scopedManager = viewer('CHANGE_MANAGER', ['change.manage', 'change.read']);
    const scopedAdmin = viewer('ADMIN', ['change.manage', 'change.read']);
    const globalManager = viewer('CHANGE_MANAGER', ['change.manage'], null);
    const access = setup();

    expect(resolveAssetScope(scopedManager, 'change.manage', null)).toEqual({ all: false, paths: ['/a'] });
    expect(resolveAssetScope(scopedAdmin, 'change.read', null)).toEqual({ all: false, paths: ['/a'] });
    expect(resolveAssetScope(globalManager, 'change.manage', null)).toEqual({ all: true });
    await expect(access.require(scopedManager, 'change.manage')).resolves.toEqual({ all: false, paths: ['/a'] });
  });

  it('gives agents their assignment unit', () => {
    expect(resolveAssetScope(viewer('AGENT', ['change.read']), 'change.read', null)).toEqual({ all: false, paths: ['/a'] });
  });

  it('clamps stored integers that never passed the settings layer (W7.77)', async () => {
    const stored: Record<string, unknown> = {
      'private.changes.normalQuorum': 1_000,
      'private.changes.emergencyQuorum': -3,
      'private.changes.minLeadTimeHours': 99_999,
      'private.changes.reminderHoursBeforeStart': 5_000,
    };
    const settings = { getSetting: jest.fn(async (key: string) => stored[key] ?? false) };
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const access = new ChangeAccessService({ group: { count: jest.fn(async () => 1) } } as never, settings as never);

    const configuration = await access.configuration();

    expect(configuration).toMatchObject({ normalQuorum: 20, emergencyQuorum: 1, minLeadTimeHours: 720, reminderHoursBeforeStart: 168 });
    // Every mismatch is named, so an operator can see why the module behaves differently from the settings screen.
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[0][0]).toContain('change_setting_clamped');
    warn.mockRestore();
  });

  it('falls back to the documented defaults when a stored integer is not a number', async () => {
    const settings = { getSetting: jest.fn(async (key: string) => (key === 'private.changes.minLeadTimeHours' ? '12' : null)) };
    const access = new ChangeAccessService({ group: { count: jest.fn(async () => 1) } } as never, settings as never);

    const configuration = await access.configuration();

    expect(configuration.normalQuorum).toBe(changeDefaults.normalQuorum);
    expect(configuration.minLeadTimeHours).toBe(changeDefaults.minLeadTimeHours);
    expect(configuration.reminderHoursBeforeStart).toBe(changeDefaults.reminderHoursBeforeStart);
  });

  it('reports capabilities and the setup hint', async () => {
    const agent = viewer('AGENT', ['change.read', 'change.request']);
    const off = await setup({ groups: 0 }).capabilities(agent);
    expect(off).toMatchObject({ enabled: false, setupRequired: true, canRead: false });
    const on = await setup().capabilities(agent);
    expect(on).toMatchObject({ enabled: true, canRead: true, canRequest: true, canManage: false, canApprove: false });
  });
});
