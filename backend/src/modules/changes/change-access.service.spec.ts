import { assetViewerFromContext, resolveAssetScope } from '../assets/asset-viewer';
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

  it('reports capabilities and the setup hint', async () => {
    const agent = viewer('AGENT', ['change.read', 'change.request']);
    const off = await setup({ groups: 0 }).capabilities(agent);
    expect(off).toMatchObject({ enabled: false, setupRequired: true, canRead: false });
    const on = await setup().capabilities(agent);
    expect(on).toMatchObject({ enabled: true, canRead: true, canRequest: true, canManage: false, canApprove: false });
  });
});
