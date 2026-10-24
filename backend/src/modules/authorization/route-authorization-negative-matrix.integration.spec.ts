import { PrismaPg } from '@prisma/adapter-pg';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '../../generated/prisma/client';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import { AuthorizationService } from './authorization.service';
import type { AuthorizationContext } from './authorization.types';
import { permissionKeys } from './authorization.constants';
import { RequireOrganizationalUnitScope } from './require-organizational-unit-scope.decorator';
import { RequirePermissions } from './require-permissions.decorator';
import { RoleGuard } from './role.guard';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

class MatrixController {
  @RequirePermissions(permissionKeys.settingsRead)
  globalSettings(): void {}

  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  ouResource(): void {}
}

function executionContext(userId: string, handler: () => void, params: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params,
        [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
          subjectId: userId,
          email: `${userId}@example.invalid`,
          displayName: userId,
          isLocalOnly: true,
        },
      }),
    }),
    getHandler: () => handler,
    getClass: () => MatrixController,
  } as never;
}

describeIfDatabase('route-level negative authorization matrix (integration)', () => {
  let prisma: PrismaClient;
  const stamp = Date.now();
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const permissionIds: string[] = [];
  const unitIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  afterAll(async () => {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (roleIds.length) await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    if (permissionIds.length) await prisma.permission.deleteMany({ where: { id: { in: permissionIds } } });
    for (const id of unitIds.reverse()) await prisma.organizationalUnit.delete({ where: { id } });
    await prisma.$disconnect();
  });

  it('denies cross-user, sibling-OU, scoped-admin global access, and inactive principals', async () => {
    const [settingsPermission, groupPermission] = await Promise.all([
      prisma.permission.upsert({ where: { key: permissionKeys.settingsRead }, update: {}, create: { key: permissionKeys.settingsRead } }),
      prisma.permission.upsert({ where: { key: permissionKeys.groupManage }, update: {}, create: { key: permissionKeys.groupManage } }),
    ]);
    const existingKeys = await prisma.permission.findMany({
      where: { id: { in: [settingsPermission.id, groupPermission.id] } },
      select: { id: true, key: true },
    });
    // Shared catalog rows are intentionally not deleted in cleanup.
    permissionIds.push(...existingKeys.filter(({ key }) => key.startsWith(`it.${stamp}`)).map(({ id }) => id));
    const role = await prisma.role.create({
      data: {
        key: `IT_ROUTE_MATRIX_${stamp}`,
        name: 'Route matrix fixture',
        rolePermissions: { createMany: { data: [{ permissionId: settingsPermission.id }, { permissionId: groupPermission.id }] } },
      },
    });
    roleIds.push(role.id);
    const root = await prisma.organizationalUnit.create({ data: { name: `Root ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=Route-Root-${stamp}`, ouPath: `/route-${stamp}` } });
    const ouA = await prisma.organizationalUnit.create({ data: { name: `A ${stamp}`, type: 'SECTOR', distinguishedName: `OU=Route-A-${stamp}`, ouPath: `${root.ouPath}/a`, parentId: root.id } });
    const childA = await prisma.organizationalUnit.create({ data: { name: `Child ${stamp}`, type: 'SERVICE', distinguishedName: `OU=Route-Child-${stamp}`, ouPath: `${ouA.ouPath}/child`, parentId: ouA.id } });
    const ouB = await prisma.organizationalUnit.create({ data: { name: `B ${stamp}`, type: 'SECTOR', distinguishedName: `OU=Route-B-${stamp}`, ouPath: `${root.ouPath}/b`, parentId: root.id } });
    unitIds.push(root.id, ouA.id, childA.id, ouB.id);
    const [owner, scopedAdmin, inactive] = await Promise.all([
      prisma.user.create({ data: { email: `route-owner-${stamp}@example.invalid`, displayName: 'Owner' } }),
      prisma.user.create({ data: { email: `route-scoped-${stamp}@example.invalid`, displayName: 'Scoped admin' } }),
      prisma.user.create({ data: { email: `route-inactive-${stamp}@example.invalid`, displayName: 'Inactive', isActive: false } }),
    ]);
    userIds.push(owner.id, scopedAdmin.id, inactive.id);
    await prisma.userRole.createMany({ data: [
      { userId: scopedAdmin.id, roleId: role.id, organizationalUnitId: ouA.id },
      { userId: inactive.id, roleId: role.id },
    ] });

    const loader = {
      loadBySubjectId: async (userId: string): Promise<AuthorizationContext | null> => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } }, organizationalUnit: true } } },
        });
        if (user?.isActive !== true) return null;
        return {
          subjectId: user.id,
          isLocalOnly: user.isLocalOnly,
          isSuperAdmin: false,
          assignments: user.userRoles.map((assignment) => ({
            roleKey: assignment.role.key,
            permissionKeys: assignment.role.rolePermissions.map(({ permission }) => permission.key),
            organizationalUnitId: assignment.organizationalUnitId,
            organizationalUnitPath: assignment.organizationalUnit?.ouPath ?? null,
            serviceId: assignment.serviceId,
          })),
        };
      },
    };
    const service = new AuthorizationService(loader as never, prisma as never);
    const guard = new RoleGuard(new Reflector(), service);

    await expect(guard.canActivate(executionContext(scopedAdmin.id, MatrixController.prototype.ouResource, { organizationalUnitId: childA.id }))).resolves.toBe(true);
    await expect(guard.canActivate(executionContext(scopedAdmin.id, MatrixController.prototype.ouResource, { organizationalUnitId: ouB.id }))).rejects.toMatchObject({ status: 403 });
    await expect(guard.canActivate(executionContext(scopedAdmin.id, MatrixController.prototype.globalSettings))).rejects.toMatchObject({ status: 403 });
    await expect(guard.canActivate(executionContext(inactive.id, MatrixController.prototype.globalSettings))).rejects.toMatchObject({ status: 403 });

    await expect(service.authorizeResource({
      principal: { subjectId: scopedAdmin.id, email: 'scoped@example.invalid', displayName: 'Scoped', isLocalOnly: true },
      permissionKey: permissionKeys.groupManage,
      ownerUserId: owner.id,
      organizationalUnitId: ouB.id,
      serviceId: null,
      allowOwner: true,
    })).resolves.toMatchObject({ allowed: false });
    await expect(service.authorizeResource({
      principal: { subjectId: owner.id, email: 'owner@example.invalid', displayName: 'Owner', isLocalOnly: true },
      permissionKey: permissionKeys.groupManage,
      ownerUserId: owner.id,
      organizationalUnitId: ouB.id,
      serviceId: null,
      allowOwner: true,
    })).resolves.toMatchObject({ allowed: true, reason: 'OWNER_ALLOWED' });
  });
});
