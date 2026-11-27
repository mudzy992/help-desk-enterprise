import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import type { JwtSigningSecretLoader } from '../authentication/jwt-signing-secret.loader';
import { RolesService } from './roles.service';

/*
  W2.31 (`BA-rbac-03`): the impact preview used to evaluate every affected user
  with a *global* request (`organizationalUnitId: null`, `serviceId: null`,
  `requireOrganizationalUnitScope: false`). The evaluator deliberately refuses a
  scoped assignment on such a check, so an OU- or service-scoped user who really
  loses (or gains) a permission produced deny/deny and no sample at all.

  This file proves the fix against real rows: the OU path and the service that
  decide scope coverage are read from PostgreSQL by the evaluator itself, the
  affected assignments come from `userRole` (with their OU/service), and the
  report names the scope it evaluated. Assignments are handed to the preview
  through a database-derived context loader — the same shape
  `PrincipalContextLoader` produces, without its Redis cache.
*/
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('role permission preview scope (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const suffix = `${process.pid}-${Date.now()}`;
  const roleKey = `IT_SCOPE_${suffix}`;
  const ouPath = `/it-scope-${suffix}`;
  const serviceName = `IT scope service ${suffix}`;
  const usedPermissionKeys = [permissionKeys.ticketMerge, permissionKeys.settingsWrite];
  const createdPermissionKeys: string[] = [];
  const userIds: string[] = [];
  let roleId = '';
  let unitId = '';
  let serviceId = '';
  let categoryId = '';
  let service: RolesService;

  const previewSigningSecret = 'it-preview-signing-secret-value-0123456789';

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  /** A context loader in the shape of `PrincipalContextLoader`, read from the rows. */
  async function loadBySubjectId(subjectId: string): Promise<AuthorizationContext | null> {
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
                rolePermissions: { select: { permission: { select: { key: true } } } },
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
        permissionKeys: row.role.rolePermissions.map((entry) => entry.permission.key),
        organizationalUnitId: row.organizationalUnitId,
        organizationalUnitPath: row.organizationalUnit?.ouPath ?? null,
        serviceId: row.service?.id ?? null,
      })),
    });
  }

  async function createFixtureUser(
    emailPrefix: string,
    assignment: { organizationalUnitId?: string; serviceId?: string },
  ): Promise<string> {
    const user = await database().user.create({
      data: {
        email: `${emailPrefix}-${suffix}@example.test`,
        displayName: `${emailPrefix} ${suffix}`,
      },
    });
    userIds.push(user.id);
    await database().userRole.create({
      data: {
        userId: user.id,
        roleId,
        organizationalUnitId: assignment.organizationalUnitId ?? null,
        serviceId: assignment.serviceId ?? null,
      },
    });
    return user.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    for (const key of usedPermissionKeys) {
      const existing = await database().permission.findUnique({ where: { key } });
      if (existing === null) {
        await database().permission.create({ data: { key, description: `IT ${key}` } });
        createdPermissionKeys.push(key);
      }
    }
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT scope ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-scope-${suffix},DC=e2e,DC=test`,
        ouPath,
      },
    });
    unitId = unit.id;
    const category = await database().serviceCategory.create({
      data: { name: `IT scope category ${suffix}`, slug: `it-scope-category-${suffix}` },
    });
    categoryId = category.id;
    const createdService = await database().service.create({
      data: {
        name: serviceName,
        slug: `it-scope-service-${suffix}`,
        categoryId,
      },
    });
    serviceId = createdService.id;
    const role = await database().role.create({
      data: { key: roleKey, name: `IT scope role ${suffix}` },
    });
    roleId = role.id;
    const permission = await database().permission.findUniqueOrThrow({
      where: { key: permissionKeys.ticketMerge },
    });
    await database().rolePermission.create({
      data: { roleId, permissionId: permission.id },
    });

    // One assignment per scope shape: the same role change is global for the
    // first user, subtree-wide for the second and service-wide for the third.
    await createFixtureUser('it-global', {});
    await createFixtureUser('it-ou', { organizationalUnitId: unitId });
    await createFixtureUser('it-service', { serviceId });

    const loader = { loadBySubjectId: (id: string) => loadBySubjectId(id) };
    service = new RolesService(
      prisma as unknown as PrismaService,
      loader as unknown as AuthorizationContextLoader,
      new ShadowAuthorizationService(
        loader as unknown as AuthorizationContextLoader,
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
    if (userIds.length > 0) await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (roleId !== '') await db.role.delete({ where: { id: roleId } });
    if (serviceId !== '') await db.service.delete({ where: { id: serviceId } });
    if (categoryId !== '') await db.serviceCategory.delete({ where: { id: categoryId } });
    if (unitId !== '') await db.organizationalUnit.delete({ where: { id: unitId } });
    if (createdPermissionKeys.length > 0) {
      await db.permission.deleteMany({
        where: { key: { in: createdPermissionKeys }, rolePermissions: { none: {} } },
      });
    }
    await db.$disconnect();
  });

  it('shows allow→deny in the OU and in the service scope, not deny/deny', async () => {
    const preview = await service.preview(roleKey, [], 'it-super-1');

    expect(preview.scopeImpacts).toEqual({
      global: 1,
      'organizational-unit': 1,
      service: 1,
      'organizational-unit-and-service': 0,
    });
    expect(preview.samples).toHaveLength(3);
    for (const sample of preview.samples) {
      expect(sample.permissionKey).toBe(permissionKeys.ticketMerge);
      expect(sample.before.decision).toBe('ALLOW');
      expect(sample.after.decision).toBe('DENY');
      expect(sample.assignmentId.length).toBeGreaterThan(0);
    }
    const byKind = new Map(preview.samples.map((sample) => [sample.scope.kind, sample]));
    expect(byKind.get('global')?.scope).toMatchObject({
      organizationalUnitId: null,
      serviceId: null,
    });
    // The OU path is the one PostgreSQL returns, not one the preview invented.
    expect(byKind.get('organizational-unit')?.scope).toMatchObject({
      organizationalUnitId: unitId,
      organizationalUnitPath: ouPath,
      serviceId: null,
    });
    expect(byKind.get('service')?.scope).toMatchObject({
      organizationalUnitId: null,
      serviceId,
      serviceName,
    });
  });

  it('shows deny→allow inside the scoped assignment when a permission is added', async () => {
    const preview = await service.preview(
      roleKey,
      [permissionKeys.ticketMerge, permissionKeys.settingsWrite],
      'it-super-1',
    );

    // The same addition is a global effect for the unscoped assignment and a
    // scoped one for the other two — all three are reported, each with its scope.
    expect(preview.scopeImpacts).toEqual({
      global: 1,
      'organizational-unit': 1,
      service: 1,
      'organizational-unit-and-service': 0,
    });
    const scoped = preview.samples.filter(
      (sample) =>
        sample.permissionKey === permissionKeys.settingsWrite &&
        sample.scope.kind !== 'global',
    );
    expect(scoped).toHaveLength(2);
    for (const sample of scoped) {
      expect(sample.before.decision).toBe('DENY');
      expect(sample.after.decision).toBe('ALLOW');
      expect(sample.scope.organizationalUnitId ?? sample.scope.serviceId).not.toBeNull();
    }
  });
});
