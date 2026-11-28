import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { createTestAssignment } from '../authorization/create-test-authorization-context';
import { OrganizationalUnitsService } from './organizational-units.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../users/record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./record-organizational-unit-change', () => ({
  recordOrganizationalUnitChange: jest.fn().mockResolvedValue(undefined),
}));

/*
  W2.36 (`BA-organizational-units-06`). `GET /organizational-units/tree` used to
  answer every role with the full `OrganizationalUnitResponse`: DN, `ouPath`,
  company, department and timestamps for the whole company. These tests pin both
  halves of the fix:

  - the query a caller without `organizationalUnit.manage` triggers never reads
    the sensitive columns at all, and
  - even a database client that ignores `select` and returns whole rows cannot put
    them on the wire, because the response is assembled from a whitelist.
*/
describe('OrganizationalUnitsService tree shape (W2.36)', () => {
  const summaryKeys = new Set(['id', 'name', 'type', 'children']);
  const forbiddenKeys = [
    'distinguishedName',
    'ouPath',
    'company',
    'department',
    'createdAt',
    'updatedAt',
    'parentId',
  ];

  const records = [
    {
      id: 'ou-root',
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
      ouPath: '/Korisnici',
      company: 'Example d.o.o.',
      department: 'IT',
      parentId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: 'ou-branch',
      name: 'Breza',
      type: 'SECTOR',
      distinguishedName: 'OU=Breza,OU=Korisnici,DC=example,DC=com',
      ouPath: '/Korisnici/Breza',
      company: null,
      department: null,
      parentId: 'ou-root',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];

  function createService(context: AuthorizationContext | null) {
    const findMany = jest.fn().mockImplementation(async (args?: { select?: unknown }) => {
      // Deliberately greedy: this fake ignores `select` and hands back whole rows,
      // which is the worst case the response mapper has to survive.
      void args;
      return records;
    });
    const prisma = { organizationalUnit: { findMany } };
    const loader = { loadBySubjectId: jest.fn().mockResolvedValue(context) };
    const service = new OrganizationalUnitsService(
      prisma as never,
      loader as never,
    );
    return { service, findMany };
  }

  const collectKeys = (nodes: readonly unknown[]): string[] => {
    const keys: string[] = [];
    const walk = (list: readonly unknown[]): void => {
      for (const node of list as readonly Record<string, unknown>[]) {
        for (const [key, value] of Object.entries(node)) {
          keys.push(key);
          if (key === 'children' && Array.isArray(value)) walk(value);
        }
      }
    };
    walk(nodes);
    return keys;
  };

  function selectionContext(): AuthorizationContext {
    return {
      subjectId: 'plain-user',
      isLocalOnly: true,
      isSuperAdmin: false,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.user,
          permissionKeys: [permissionKeys.ticketMerge],
        }),
      ],
    };
  }

  function manageContext(): AuthorizationContext {
    return {
      subjectId: 'global-admin',
      isLocalOnly: true,
      isSuperAdmin: false,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.admin,
          permissionKeys: [permissionKeys.organizationalUnitManage],
        }),
      ],
    };
  }

  it('reads only the four selector columns for a caller without the manage permission', async () => {
    const { service, findMany } = createService(selectionContext());
    const tree = await service.getTree('plain-user');

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0]?.[0] as { select?: Record<string, boolean> };
    expect(args.select).toEqual({ id: true, name: true, type: true, parentId: true });
    expect(Object.keys(args.select ?? {})).not.toContain('distinguishedName');
    expect(Object.keys(args.select ?? {})).not.toContain('ouPath');
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 'ou-root', name: 'Korisnici', type: 'DIRECTORATE' });
  });

  it('cannot leak a sensitive column even when the client returns whole rows', async () => {
    const { service } = createService(selectionContext());
    const tree = await service.getTree('plain-user');

    const keys = collectKeys(tree);
    for (const key of keys) expect(summaryKeys.has(key)).toBe(true);
    for (const key of forbiddenKeys) expect(keys).not.toContain(key);
    // The nesting is still there: the selector needs the parent structure, not the paths.
    expect(JSON.stringify(tree)).not.toContain('DC=example');
    expect(JSON.stringify(tree)).not.toContain('/Korisnici');
    expect((tree[0] as { children?: readonly unknown[] }).children).toHaveLength(1);
  });

  it('gives a caller without an identity the minimal shape, never the wider answer', async () => {
    const { service, findMany } = createService(null);
    const tree = await service.getTree(null);
    const args = findMany.mock.calls[0]?.[0] as { select?: unknown };
    expect(args.select).toBeDefined();
    expect(collectKeys(tree).every((key) => summaryKeys.has(key))).toBe(true);
  });

  it('keeps the full admin projection for a holder of organizationalUnit.manage', async () => {
    const { service, findMany } = createService(manageContext());
    const tree = await service.getTree('global-admin');

    const args = findMany.mock.calls[0]?.[0] as { select?: unknown };
    expect(args.select).toBeUndefined();
    expect(tree[0]).toMatchObject({
      id: 'ou-root',
      ouPath: '/Korisnici',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
      company: 'Example d.o.o.',
    });
  });
});
