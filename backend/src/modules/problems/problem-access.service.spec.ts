import { assetViewerFromContext, resolveAssetScope } from '../assets/asset-viewer';
import { ProblemAccessService } from './problem-access.service';

function setup(options: { addon?: boolean; groups?: number; member?: boolean } = {}) {
  const prisma = {
    group: { count: jest.fn(async () => options.groups ?? 1) },
    groupMember: { count: jest.fn(async () => (options.member ? 1 : 0)) },
  };
  const settings = { getSetting: jest.fn(async () => options.addon ?? true) };
  return new ProblemAccessService(prisma as never, settings as never);
}

const viewer = (roleKey: string, permissions: string[], ou: { id: string; path: string } | null = null) =>
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
    'problem.',
  );

describe('ProblemAccessService (problem groups, decision 2026-10-01)', () => {
  it('is active only with the addon on and at least one problem group', async () => {
    expect(await setup({ groups: 0 }).isEnabled()).toBe(false);
    expect(await setup({ addon: false }).isEnabled()).toBe(false);
    expect(await setup().isEnabled()).toBe(true);
  });

  it('gives a problem manager authority only inside the problem group', async () => {
    const manager = viewer('PROBLEM_MANAGER', ['problem.read', 'problem.manage', 'problem.close']);
    expect(await setup({ member: true }).hasGroupAuthority(manager, 'problem.close', 'g1')).toBe(true);
    expect(await setup({ member: false }).hasGroupAuthority(manager, 'problem.close', 'g1')).toBe(false);
    expect(await setup({ member: true }).hasGroupAuthority(manager, 'problem.close', null)).toBe(false);
  });

  it('lets admins act without membership and never agents', async () => {
    const admin = viewer('ADMIN', ['problem.manage', 'problem.close']);
    const agent = viewer('AGENT', ['problem.read', 'problem.report']);
    expect(await setup({ member: false }).hasGroupAuthority(admin, 'problem.close', 'g1')).toBe(true);
    expect(await setup({ member: true }).hasGroupAuthority(agent, 'problem.manage', 'g1')).toBe(false);
  });

  it('keeps scoped ADMIN and PROBLEM_MANAGER permissions inside their assignment OU', async () => {
    const scopedAdmin = viewer('ADMIN', ['problem.read', 'problem.close'], { id: 'ou-a', path: '/a' });
    const scopedManager = viewer('PROBLEM_MANAGER', ['problem.read', 'problem.manage'], { id: 'ou-b', path: '/b' });
    const access = setup();

    await expect(access.require(scopedAdmin, 'problem.read')).resolves.toEqual({ all: false, paths: ['/a'] });
    await expect(access.require(scopedManager, 'problem.read')).resolves.toEqual({ all: false, paths: ['/b'] });
    expect(resolveAssetScope(scopedManager, 'problem.manage', null)).toEqual({ all: false, paths: ['/b'] });
    expect(scopedAdmin.isAdmin).toBe(true);
  });

  it('allows cross-unit problem scope only for an installation-wide manager assignment', () => {
    const manager = viewer('PROBLEM_MANAGER', ['problem.read']);
    expect(manager.grants.every((grant) => grant.global)).toBe(true);
    expect(resolveAssetScope(manager, 'problem.read', null)).toEqual({ all: true });
  });
});
