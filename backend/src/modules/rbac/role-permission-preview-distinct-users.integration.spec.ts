import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import { shadowAuthorizationDecisions } from '../authorization/shadow-authorization.types';
import type { JwtSigningSecretLoader } from '../authentication/jwt-signing-secret.loader';
import { RolesService } from './roles.service';

/*
  W2.33 (`BA-rbac-06`): the impact preview counted `userRole` **rows**. The schema
  allows the same person to hold the same role in several OU/service scopes, so a
  role with three grants behind two people was reported as "3 affected users",
  and the three sample slots could all be spent on one person.

  This file proves the fix on real rows: one holder with two scoped assignments
  and one unscoped holder. The report must say two people / three grants, must
  count every changed decision per assignment, and must not spend more than one
  sample row on the same person.
*/
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('role permission preview distinct users (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const suffix = `${process.pid}-${Date.now()}`;
  const roleKey = `IT_DISTINCT_${suffix}`;
  const ouPath = `/it-distinct-${suffix}`;
  const createdPermissionKeys: string[] = [];
  const userIds: string[] = [];
  let roleId = '';
  let unitId = '';
  let service: RolesService;

  const previewSigningSecret = 'it-preview-signing-secret-value-0123456789';
  const usedPermissionKeys = [permissionKeys.ticketMerge];

  function database(): PrismaClient {
    if (prisma === undefined) {
      throw new Error('integration Prisma client was not initialized');
    }
    return prisma;
  }

  /** A context loader in the shape of `PrincipalContextLoader`, read from rows. */
  async function loadBySubjectId(
    subjectId: string,
  ): Promise<AuthorizationContext | null> {
    const user = await database().user.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        isActive: true,
        isLocalOnly: true,
        entraObjectId: true,
        directoryObjectGuid: true,
        userRoles: {
          select: {
            organizationalUnitId: true,
            serviceId: true,
            organizationalUnit: { select: { ouPath: true } },
            service: { select: { id: true } },
            role: {
              select: {
                key: true,
                rolePermissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (user === null) return null;
    return createAuthorizationContext({
      id: user.id,
      isActive: user.isActive,
      isLocalOnly: user.isLocalOnly,
      entraObjectId: user.entraObjectId,
      directoryObjectGuid: user.directoryObjectGuid,
      assignments: user.userRoles.map((row) => ({
        roleKey: row.role.key,
        permissionKeys: row.role.rolePermissions.map(
          (entry) => entry.permission.key,
        ),
        organizationalUnitId: row.organizationalUnitId,
        organizationalUnitPath: row.organizationalUnit?.ouPath ?? null,
        serviceId: row.service?.id ?? null,
      })),
    });
  }

  async function createHolder(
    displayName: string,
    assignments: readonly {
      readonly organizationalUnitId?: string;
    }[],
  ): Promise<string> {
    const user = await database().user.create({
      data: {
        email: `it-distinct-${suffix}-${userIds.length}@example.invalid`,
        displayName,
      },
    });
    userIds.push(user.id);
    for (const assignment of assignments) {
      await database().userRole.create({
        data: {
          userId: user.id,
          roleId,
          organizationalUnitId: assignment.organizationalUnitId ?? null,
        },
      });
    }
    return user.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    for (const key of usedPermissionKeys) {
      const existing = await database().permission.findUnique({ where: { key } });
      if (existing === null) {
        await database().permission.create({
          data: { key, description: `IT ${key}` },
        });
        createdPermissionKeys.push(key);
      }
    }
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT distinct ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-distinct-${suffix},DC=e2e,DC=test`,
        ouPath,
      },
    });
    unitId = unit.id;
    const role = await database().role.create({
      data: { key: roleKey, name: `IT distinct role ${suffix}` },
    });
    roleId = role.id;
    const basePermission = await database().permission.findUniqueOrThrow({
      where: { key: permissionKeys.ticketMerge },
    });
    await database().rolePermission.create({
      data: { roleId, permissionId: basePermission.id },
    });
    // Person A holds the role twice (global + OU); person B holds it once.
    await createHolder('A — dva scopea', [{}, { organizationalUnitId: unitId }]);
    await createHolder('B — jedan scope', [{}]);

    const loader = { loadBySubjectId } as unknown as AuthorizationContextLoader;
    service = new RolesService(
      prisma as unknown as PrismaService,
      loader,
      new ShadowAuthorizationService(
        loader,
        prisma as unknown as PrismaService,
      ),
      undefined,
      { load: async () => previewSigningSecret } as unknown as JwtSigningSecretLoader,
    );
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.auditLog.deleteMany({ where: { entityId: roleKey } });
    await db.rolePermissionPreviewClaim.deleteMany({ where: { roleKey } });
    if (userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (roleId !== '') await db.role.delete({ where: { id: roleId } });
    if (unitId !== '') await db.organizationalUnit.delete({ where: { id: unitId } });
    if (createdPermissionKeys.length > 0) {
      await db.permission.deleteMany({
        where: { key: { in: createdPermissionKeys }, rolePermissions: { none: {} } },
      });
    }
    await db.$disconnect();
  });

  it('reports distinct people next to the grants and samples each person once', async () => {
    const preview = await service.preview(roleKey, [], 'super-1');

    // Three grants (A twice, B once) behind two people.
    expect(preview.affectedAssignmentCount).toBe(3);
    expect(preview.affectedUserCount).toBe(2);

    // Every changed decision is still counted per assignment: A's global grant,
    // A's OU grant and B's global grant.
    expect(preview.scopeImpacts).toEqual({
      global: 2,
      'organizational-unit': 1,
      service: 0,
      'organizational-unit-and-service': 0,
    });

    // One row per person, never three rows for one person.
    expect(preview.samples.length).toBe(2);
    expect(new Set(preview.samples.map((sample) => sample.userId)).size).toBe(
      preview.samples.length,
    );
    expect(
      preview.samples.every(
        (sample) => sample.before.decision === shadowAuthorizationDecisions.allow,
      ),
    ).toBe(true);
    expect(
      preview.samples.every(
        (sample) => sample.after.decision === shadowAuthorizationDecisions.deny,
      ),
    ).toBe(true);
  });
});
