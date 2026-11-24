import { ForbiddenException } from '@nestjs/common';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { createTestAssignment } from '../authorization/create-test-authorization-context';
import { createInMemoryOrganizationalUnitPrisma } from './create-in-memory-organizational-unit-prisma';
import { OrganizationalUnitsService } from './organizational-units.service';
import { testOrganizationalUnitAdminContext } from './create-test-organizational-unit-scope';

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
  W2.9 (`BA-organizational-units-01`). The control plane used to be role-only:
  any ADMIN could read, map and delete any unit anywhere. These tests pin the
  three decisions that used to be missing — tree visibility, the unit a user is
  pulled out of, and the destination of a move — plus the two legitimate wide
  grants (global ADMIN assignment and local SuperAdmin).
*/
describe('OrganizationalUnitsService scope enforcement (W2.9)', () => {
  type ScopeActor =
    | 'scoped-admin'
    | 'global-admin'
    | 'plain-user'
    | 'super-admin';

  const createContext = (actor: ScopeActor, scope: { id: string; ouPath: string } | null): AuthorizationContext => {
    switch (actor) {
      case 'scoped-admin':
        return {
          subjectId: 'scoped-admin',
          isLocalOnly: true,
          isSuperAdmin: false,
          assignments: [
            createTestAssignment({
              roleKey: authorizationRoleKeys.admin,
              permissionKeys: [permissionKeys.organizationalUnitManage],
              organizationalUnitId: scope?.id ?? null,
              organizationalUnitPath: scope?.ouPath ?? null,
            }),
          ],
        };
      case 'global-admin':
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
      case 'plain-user':
        return {
          subjectId: 'plain-user',
          isLocalOnly: true,
          isSuperAdmin: false,
          assignments: [
            createTestAssignment({
              roleKey: authorizationRoleKeys.user,
              permissionKeys: [],
            }),
          ],
        };
      case 'super-admin':
        return {
          subjectId: 'super-admin',
          isLocalOnly: true,
          isSuperAdmin: true,
          assignments: [],
        };
    }
  };

  const setup = async () => {
    const memory = createInMemoryOrganizationalUnitPrisma();
    let scopeOf: { id: string; ouPath: string } | null = null;
    const loader = {
      loadBySubjectId: jest.fn(async (subjectId: string) => {
        if (subjectId === 'super-admin') return createContext('super-admin', null);
        // `testOrganizationalUnitAdminContext` uses this fixed actor id.
        if (subjectId === 'admin-1') return createContext('global-admin', null);
        return createContext(subjectId as ScopeActor, scopeOf);
      }),
    };
    const service = new OrganizationalUnitsService(
      memory.prisma as never,
      loader as never,
    );

    const root = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=example,DC=com',
    });
    const branchA = await service.create({
      name: 'Breza',
      type: 'SECTOR',
      distinguishedName: 'OU=Breza,OU=Korisnici,DC=example,DC=com',
      parentId: root.id,
    });
    const childOfA = await service.create({
      name: 'Zenica',
      type: 'SERVICE',
      distinguishedName: 'OU=Zenica,OU=Breza,OU=Korisnici,DC=example,DC=com',
      parentId: branchA.id,
    });
    const branchB = await service.create({
      name: 'Visoko',
      type: 'SECTOR',
      distinguishedName: 'OU=Visoko,OU=Korisnici,DC=example,DC=com',
      parentId: root.id,
    });
    memory.seedUser({
      id: 'user-in-b',
      email: 'b@example.com',
      displayName: 'B User',
      organizationalUnitId: branchB.id,
      isLocalOnly: true,
      entraObjectId: null,
      localPasswordHash: 'hash-must-not-leak',
    });
    memory.seedUser({
      id: 'user-in-a',
      email: 'a@example.com',
      displayName: 'A User',
      organizationalUnitId: branchA.id,
      isLocalOnly: true,
      entraObjectId: null,
      localPasswordHash: 'hash-must-not-leak',
    });

    return {
      memory,
      service,
      root,
      branchA,
      childOfA,
      branchB,
      scopeTo: (unit: { id: string; ouPath: string } | null) => {
        scopeOf = unit;
      },
    };
  };

  const ids = (nodes: readonly { id: string }[]): string[] => {
    const collected: string[] = [];
    const walk = (list: readonly { id: string; children?: readonly unknown[] }[]): void => {
      for (const node of list) {
        collected.push(node.id);
        walk((node.children ?? []) as readonly { id: string; children?: readonly unknown[] }[]);
      }
    };
    walk(nodes as readonly { id: string; children?: readonly unknown[] }[]);
    return collected;
  };

  it('shows a scoped ADMIN only its own subtree', async () => {
    const { service, branchA, childOfA, scopeTo } = await setup();
    scopeTo({ id: branchA.id, ouPath: branchA.ouPath });

    const tree = await service.getTree('scoped-admin');

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(branchA.id);
    // The branch itself becomes the root; the parent outside the scope is gone.
    expect(tree[0]?.parentId ?? null).toBeNull();
    expect(ids(tree).sort()).toEqual([branchA.id, childOfA.id].sort());
  });

  it('shows a globally granted ADMIN and a caller without the permission the whole tree', async () => {
    const { service, root, branchA, childOfA, branchB, scopeTo } = await setup();
    scopeTo(null);
    const expected = [root.id, branchA.id, childOfA.id, branchB.id].sort();

    expect(ids(await service.getTree('global-admin')).sort()).toEqual(expected);
    // A USER keeps the tree it needs for filters; its data access is decided elsewhere.
    expect(ids(await service.getTree('plain-user')).sort()).toEqual(expected);
    expect(ids(await service.getTree(null)).sort()).toEqual(expected);
  });

  it('refuses to pull a user out of a unit outside the scope', async () => {
    const { service, branchA, scopeTo } = await setup();
    scopeTo({ id: branchA.id, ouPath: branchA.ouPath });

    await expect(
      service.assignUser(
        { userId: 'user-in-b', organizationalUnitId: branchA.id },
        { actorUserId: 'scoped-admin', requestId: 'req-1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to map a user into a unit outside the scope', async () => {
    const { service, branchA, branchB, scopeTo } = await setup();
    scopeTo({ id: branchA.id, ouPath: branchA.ouPath });

    await expect(
      service.assignUser(
        { userId: 'user-in-a', organizationalUnitId: branchB.id },
        { actorUserId: 'scoped-admin', requestId: 'req-1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the mapping when both units are inside the scope', async () => {
    const { service, branchA, childOfA, scopeTo } = await setup();
    scopeTo({ id: branchA.id, ouPath: branchA.ouPath });

    const mapped = await service.assignUser(
      { userId: 'user-in-a', organizationalUnitId: childOfA.id },
      { actorUserId: 'scoped-admin', requestId: 'req-1' },
    );

    expect(mapped.organizationalUnitId).toBe(childOfA.id);
  });

  it('refuses to move a unit under a foreign parent', async () => {
    const { service, childOfA, branchB, scopeTo } = await setup();
    scopeTo({ id: childOfA.id, ouPath: childOfA.ouPath });

    await expect(
      service.update(childOfA.id, { parentId: branchB.id }, {
        actorUserId: 'scoped-admin',
        requestId: 'req-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to promote a unit to root for a scoped ADMIN', async () => {
    const { service, branchA, childOfA, scopeTo } = await setup();
    scopeTo({ id: branchA.id, ouPath: branchA.ouPath });

    await expect(
      service.update(childOfA.id, { parentId: null }, {
        actorUserId: 'scoped-admin',
        requestId: 'req-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a mapping when the actor is missing entirely', async () => {
    const { service, branchA } = await setup();

    await expect(
      service.assignUser({ userId: 'user-in-a', organizationalUnitId: branchA.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a local SuperAdmin bypass the scope', async () => {
    const { service, childOfA, branchB } = await setup();

    const mapped = await service.assignUser(
      { userId: 'user-in-a', organizationalUnitId: branchB.id },
      { actorUserId: 'super-admin', requestId: 'req-1' },
    );

    expect(mapped.organizationalUnitId).toBe(branchB.id);
    // The unit itself is still guard-protected at the route; here only the
    // second target (the unit the user leaves) is decided.
    expect(childOfA.id).not.toBe(mapped.organizationalUnitId);
  });

  it('keeps the global administrator path working for administrative fixtures', async () => {
    const { service, branchB } = await setup();

    const mapped = await service.assignUser(
      { userId: 'user-in-a', organizationalUnitId: branchB.id },
      testOrganizationalUnitAdminContext,
    );

    expect(mapped.organizationalUnitId).toBe(branchB.id);
  });
});
