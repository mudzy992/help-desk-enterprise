import { assetWhereOf, problemAssetAccess } from './problem-asset-access';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));

const scoped = {
  subjectId: 'u1',
  isActive: true,
  homeOrganizationalUnitId: null,
  assignments: [{
    roleKey: 'AGENT',
    permissionKeys: ['asset.read'],
    organizationalUnitId: 'ou1',
    organizationalUnitPath: '/inside',
    serviceId: null,
  }],
};
const unscoped = { ...scoped, homeOrganizationalUnitId: 'home', assignments: [{ ...scoped.assignments[0], organizationalUnitId: null, organizationalUnitPath: null }] };
const globalAdmin = {
  ...scoped,
  assignments: [{ ...scoped.assignments[0], roleKey: 'ADMIN', organizationalUnitId: null, organizationalUnitPath: null }],
};
const superAdmin = { ...scoped, assignments: [{ ...scoped.assignments[0], roleKey: 'SUPER_ADMIN', organizationalUnitId: null, organizationalUnitPath: null }] };

const prisma = (homePath: string | null = '/home') => ({
  organizationalUnit: { findUnique: jest.fn(async () => ({ ouPath: homePath })) },
});

describe('problem asset access (BA-problems-03)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fails closed for missing and inactive principals', async () => {
    for (const value of [null, { ...scoped, isActive: false }]) {
      (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(value);
      await expect(problemAssetAccess(prisma() as never, 'u1')).resolves.toEqual({ allowed: false, where: null });
    }
  });

  it('denies a problem manager without the asset.read grant', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce({ ...scoped, assignments: [{ ...scoped.assignments[0], permissionKeys: ['problem.read', 'problem.manage'] }] });
    const access = await problemAssetAccess(prisma() as never, 'u1');
    expect(access).toEqual({ allowed: false, where: null });
    expect(assetWhereOf(access)).toEqual({ id: { in: [] } });
  });

  it('does not turn a global problem grant into a global CMDB grant', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce({
      ...scoped,
      assignments: [
        { ...scoped.assignments[0], roleKey: 'PROBLEM_MANAGER', organizationalUnitId: null, organizationalUnitPath: null },
        scoped.assignments[0],
      ],
    });
    const access = await problemAssetAccess(prisma() as never, 'u1');
    expect(access.allowed).toBe(true);
    expect(JSON.stringify(assetWhereOf(access))).toContain('/inside');
    expect(JSON.stringify(assetWhereOf(access))).not.toContain('/home');
  });

  it('grants every unit only for a super admin or an installation-wide admin grant', async () => {
    for (const principal of [superAdmin, globalAdmin]) {
      (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(principal);
      const access = await problemAssetAccess(prisma() as never, 'u1');
      expect(access).toEqual({ allowed: true, where: null });
      expect(assetWhereOf(access)).toEqual({});
    }
  });

  it('constrains a scoped grant to its unit and descendants', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(scoped);
    const access = await problemAssetAccess(prisma() as never, 'u1');
    expect(access).toEqual({
      allowed: true,
      where: { organizationalUnit: { OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }] } },
    });
  });

  it('falls back to the home unit for an unscoped grant', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(unscoped);
    const access = await problemAssetAccess(prisma('/home') as never, 'u1');
    expect(JSON.stringify(assetWhereOf(access))).toContain('/home');
  });

  it('returns an impossible predicate instead of the NUL sentinel when no unit is in scope', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(unscoped);
    const access = await problemAssetAccess(prisma(null) as never, 'u1');
    expect(access.allowed).toBe(true);
    expect(assetWhereOf(access)).toEqual({ id: { in: [] } });
    expect(JSON.stringify(assetWhereOf(access))).not.toContain('\\u0000');
  });
});
