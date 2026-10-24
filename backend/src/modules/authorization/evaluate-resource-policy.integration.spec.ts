import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { evaluateResourcePolicy } from './evaluate-resource-policy';
import type { AuthorizationContext } from './authorization.types';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('central resource policy matrix (integration)', () => {
  let prisma: PrismaClient;
  const stamp = Date.now();
  const userIds: string[] = [];
  let roleId: string;
  let permissionId: string;
  let categoryId: string;
  const unitIds: string[] = [];
  const serviceIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });
  afterAll(async () => {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    if (permissionId) await prisma.permission.delete({ where: { id: permissionId } });
    if (serviceIds.length) await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
    if (categoryId) await prisma.serviceCategory.delete({ where: { id: categoryId } });
    for (const id of unitIds.reverse()) await prisma.organizationalUnit.delete({ where: { id } });
    await prisma.$disconnect();
  });

  async function loadContext(userId: string): Promise<AuthorizationContext> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } }, organizationalUnit: true, service: true } } },
    });
    return {
      subjectId: user.id,
      isLocalOnly: user.isLocalOnly,
      isSuperAdmin: false,
      assignments: user.userRoles.map((row) => ({
        roleKey: row.role.key,
        permissionKeys: row.role.rolePermissions.map((item) => item.permission.key),
        organizationalUnitId: row.organizationalUnitId,
        organizationalUnitPath: row.organizationalUnit?.ouPath ?? null,
        serviceId: row.serviceId,
      })),
    };
  }

  it('denies cross-user, sibling-OU and foreign-service access while allowing positive controls', async () => {
    const permission = await prisma.permission.create({ data: { key: `it.resource.read.${stamp}`, description: 'Integration policy permission' } });
    permissionId = permission.id;
    const role = await prisma.role.create({
      data: { key: `IT_POLICY_${stamp}`, name: 'Policy fixture', rolePermissions: { create: { permissionId } } },
    });
    roleId = role.id;
    const [owner, ouActor, serviceActor] = await Promise.all([
      prisma.user.create({ data: { email: `owner-${stamp}@example.invalid`, displayName: 'Owner' } }),
      prisma.user.create({ data: { email: `ou-${stamp}@example.invalid`, displayName: 'OU actor' } }),
      prisma.user.create({ data: { email: `service-${stamp}@example.invalid`, displayName: 'Service actor' } }),
    ]);
    userIds.push(owner.id, ouActor.id, serviceActor.id);
    const root = await prisma.organizationalUnit.create({ data: { name: `Root ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=Root-${stamp}`, ouPath: `/root-${stamp}` } });
    const ouA = await prisma.organizationalUnit.create({ data: { name: `A ${stamp}`, type: 'SECTOR', distinguishedName: `OU=A-${stamp}`, ouPath: `${root.ouPath}/a`, parentId: root.id } });
    const ouChild = await prisma.organizationalUnit.create({ data: { name: `Child ${stamp}`, type: 'SERVICE', distinguishedName: `OU=Child-${stamp}`, ouPath: `${ouA.ouPath}/child`, parentId: ouA.id } });
    const ouB = await prisma.organizationalUnit.create({ data: { name: `B ${stamp}`, type: 'SECTOR', distinguishedName: `OU=B-${stamp}`, ouPath: `${root.ouPath}/b`, parentId: root.id } });
    unitIds.push(root.id, ouA.id, ouChild.id, ouB.id);
    const category = await prisma.serviceCategory.create({ data: { name: `Policy ${stamp}`, slug: `policy-${stamp}` } });
    categoryId = category.id;
    const [serviceA, serviceB] = await Promise.all([
      prisma.service.create({ data: { name: `Service A ${stamp}`, slug: `policy-a-${stamp}`, categoryId, lifecycle: 'ACTIVE' } }),
      prisma.service.create({ data: { name: `Service B ${stamp}`, slug: `policy-b-${stamp}`, categoryId, lifecycle: 'ACTIVE' } }),
    ]);
    serviceIds.push(serviceA.id, serviceB.id);
    await prisma.userRole.createMany({ data: [
      { userId: owner.id, roleId },
      { userId: ouActor.id, roleId, organizationalUnitId: ouA.id },
      { userId: serviceActor.id, roleId, serviceId: serviceA.id },
    ] });
    const [ownerContext, ouContext, serviceContext] = await Promise.all([
      loadContext(owner.id), loadContext(ouActor.id), loadContext(serviceActor.id),
    ]);
    const decide = (context: AuthorizationContext, target: Parameters<typeof evaluateResourcePolicy>[0]['target'], allowOwner = false) =>
      evaluateResourcePolicy({ context, permissionKey: permission.key, target, allowOwner });

    expect(decide(ouContext, { ownerUserId: null, organizationalUnitId: ouChild.id, organizationalUnitPath: ouChild.ouPath, serviceId: null }).allowed).toBe(true);
    expect(decide(ouContext, { ownerUserId: null, organizationalUnitId: ouB.id, organizationalUnitPath: ouB.ouPath, serviceId: null }).allowed).toBe(false);
    expect(decide(serviceContext, { ownerUserId: null, organizationalUnitId: null, organizationalUnitPath: null, serviceId: serviceA.id }).allowed).toBe(true);
    expect(decide(serviceContext, { ownerUserId: null, organizationalUnitId: null, organizationalUnitPath: null, serviceId: serviceB.id }).allowed).toBe(false);
    expect(decide(ouContext, { ownerUserId: owner.id, organizationalUnitId: ouB.id, organizationalUnitPath: ouB.ouPath, serviceId: null }, true).allowed).toBe(false);
    expect(decide(ownerContext, { ownerUserId: owner.id, organizationalUnitId: ouB.id, organizationalUnitPath: ouB.ouPath, serviceId: null }, true).allowed).toBe(true);
  });
});
