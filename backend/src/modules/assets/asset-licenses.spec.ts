import { randomBytes } from 'node:crypto';
import { decryptLicenseKey, encryptLicenseKey, readLicenseKeyCipherKey } from './asset-license-cipher';
import type { AssetViewer } from './asset-viewer';
import {
  canViewLicenseUserAssignment,
  isLicenseUserAssignmentCompatible,
  licenseAssignmentTarget,
  licenseCompliance,
  AssetLicensesService,
} from './asset-licenses.service';

describe('licences (paket 3.2 §9)', () => {
  it('counts seats except for site licences and flags over-allocation', () => {
    expect(licenseCompliance('PER_DEVICE', 10, 4)).toEqual({ used: 4, seats: 10, available: 6, overAllocated: false });
    expect(licenseCompliance('PER_USER', 2, 3)).toEqual({ used: 3, seats: 2, available: -1, overAllocated: true });
    expect(licenseCompliance('SITE', null, 99)).toEqual({ used: 99, seats: null, available: null, overAllocated: false });
  });

  it('maps the kind to the assignment side', () => {
    expect(licenseAssignmentTarget('PER_DEVICE')).toBe('asset');
    expect(licenseAssignmentTarget('PER_USER')).toBe('user');
    expect(licenseAssignmentTarget('SUBSCRIPTION')).toBe('either');
    expect(licenseAssignmentTarget('SITE')).toBe('none');
  });

  it('treats the license OU and its descendants as compatible, not parents or prefix siblings', () => {
    expect(isLicenseUserAssignmentCompatible('/org/root', '/org/root')).toBe(true);
    expect(isLicenseUserAssignmentCompatible('/org/root/team/member', '/org/root')).toBe(true);
    expect(isLicenseUserAssignmentCompatible('/org', '/org/root')).toBe(false);
    expect(isLicenseUserAssignmentCompatible('/org/rooted', '/org/root')).toBe(false);
    expect(isLicenseUserAssignmentCompatible(null, '/org/root')).toBe(false);
  });

  it('shows a user assignment only inside both reader scope and license OU', () => {
    const readScope = { all: false as const, paths: ['/org/root/team'] };
    expect(canViewLicenseUserAssignment('/org/root/team/member', '/org/root', readScope)).toBe(true);
    expect(canViewLicenseUserAssignment('/org/root/other/member', '/org/root', readScope)).toBe(false);
    expect(canViewLicenseUserAssignment('/org/foreign/member', '/org/root', { all: true })).toBe(false);
  });

  it('encrypts keys with a key derived from MFA_ENCRYPTION_KEY', () => {
    const env = { MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv;
    const key = readLicenseKeyCipherKey(env);
    expect(key).not.toBeNull();
    const stored = encryptLicenseKey('ABCDE-12345-FGHIJ', key);
    expect(stored).not.toContain('ABCDE');
    expect(decryptLicenseKey(stored, key)).toBe('ABCDE-12345-FGHIJ');
    // The derived key differs from the MFA key itself.
    expect(key?.equals(Buffer.from(env.MFA_ENCRYPTION_KEY as string, 'base64'))).toBe(false);
  });

  it('has no key without MFA_ENCRYPTION_KEY', () => {
    expect(readLicenseKeyCipherKey({} as NodeJS.ProcessEnv)).toBeNull();
    expect(() => encryptLicenseKey('x', null)).toThrow();
  });
});

describe('AssetLicensesService cursor pages', () => {
  const viewer: AssetViewer = { userId: 'reader', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
  const row = (id: string) => ({
    id,
    productName: `Product ${id}`,
    vendor: null,
    kind: 'PER_DEVICE' as const,
    seats: 5,
    validUntil: null,
    cost: null,
    notes: null,
    keyEncrypted: null,
    organizationalUnit: { id: 'ou-1', name: 'Root', ouPath: '/root' },
    _count: { assignments: 1 },
    updatedAt: new Date('2026-10-31T00:00:00Z'),
  });

  it('uses the requested cursor page and returns hasMore without dropping the next row', async () => {
    const prisma = { softwareLicense: { findMany: jest.fn().mockResolvedValue([row('license-1'), row('license-2')]) } };
    const access = { require: jest.fn().mockResolvedValue({ all: true }) };
    const service = new AssetLicensesService(prisma as never, access as never);

    const result = await service.list({ limit: 1, cursor: 'license-0' }, viewer);

    expect(result).toMatchObject({ items: [{ id: 'license-1' }], hasMore: true, nextCursor: 'license-1' });
    expect(prisma.softwareLicense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        cursor: { id: 'license-0' },
        skip: 1,
        orderBy: [{ productName: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('pages only assignments visible through the license OU and reports more rows separately from scope-hidden rows', async () => {
    const assignmentRows = [
      { id: 'assignment-1', assignedAt: new Date('2026-10-31T10:00:00Z'), asset: { id: 'asset-1', assetTag: 'A-1', name: 'Laptop' }, user: null },
      { id: 'assignment-2', assignedAt: new Date('2026-10-30T10:00:00Z'), asset: null, user: { id: 'user-1', displayName: 'Amra', email: 'amra@example.com', isActive: true, organizationalUnit: { ouPath: '/root/team' } } },
    ];
    const prisma = {
      softwareLicense: { findUnique: jest.fn().mockResolvedValue(row('license-1')) },
      licenseAssignment: {
        findMany: jest.fn().mockResolvedValue(assignmentRows),
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const access = { require: jest.fn().mockResolvedValue({ all: true }) };
    const service = new AssetLicensesService(prisma as never, access as never);

    const result = await service.listAssignments('license-1', { cursor: 'assignment-0', limit: 1 }, viewer);

    expect(result).toMatchObject({ items: [{ id: 'assignment-1' }], hasMore: true, nextCursor: 'assignment-1' });
    expect(prisma.licenseAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        cursor: { id: 'assignment-0' },
        skip: 1,
        orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
        where: {
          licenseId: 'license-1',
          OR: [
            { userId: null },
            {
              user: {
                is: {
                  organizationalUnit: {
                    is: {
                      OR: [{ ouPath: '/root' }, { ouPath: { startsWith: '/root/' } }],
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    );
  });
});
