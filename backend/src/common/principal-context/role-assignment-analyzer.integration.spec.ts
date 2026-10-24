import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('canonical role assignment database invariants (integration)', () => {
  let prisma: PrismaClient;
  const stamp = Date.now();
  const userIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });
  afterAll(async () => {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { key: { startsWith: `IT_SCOPE_${stamp}` } } });
    await prisma.$disconnect();
  });

  it('serializes concurrent duplicate global grants so exactly one commits', async () => {
    const [user, role] = await Promise.all([
      prisma.user.create({ data: { email: `scope-${stamp}@example.invalid`, displayName: 'Scope fixture' } }),
      prisma.role.create({ data: { key: `IT_SCOPE_${stamp}`, name: 'Scope fixture' } }),
    ]);
    userIds.push(user.id);
    const outcomes = await Promise.allSettled([
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await prisma.userRole.count({ where: { userId: user.id, roleId: role.id } })).toBe(1);
  });

  it('rejects dual-scope rows without persisting a partial assignment', async () => {
    const [user, role] = await Promise.all([
      prisma.user.create({ data: { email: `dual-${stamp}@example.invalid`, displayName: 'Dual fixture' } }),
      prisma.role.create({ data: { key: `IT_SCOPE_${stamp}_DUAL`, name: 'Dual fixture' } }),
    ]);
    userIds.push(user.id);
    const category = await prisma.serviceCategory.create({ data: { name: `Scope ${stamp}`, slug: `scope-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Scope ${stamp}`, slug: `scope-service-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const unit = await prisma.organizationalUnit.create({ data: { name: `Scope ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=Scope-${stamp}`, ouPath: `/scope-${stamp}` } });
    await expect(prisma.userRole.create({ data: { userId: user.id, roleId: role.id, organizationalUnitId: unit.id, serviceId: service.id } })).rejects.toBeDefined();
    expect(await prisma.userRole.count({ where: { userId: user.id, roleId: role.id } })).toBe(0);
    await prisma.service.delete({ where: { id: service.id } });
    await prisma.serviceCategory.delete({ where: { id: category.id } });
    await prisma.organizationalUnit.delete({ where: { id: unit.id } });
  });

  it('rejects a scoped SUPER_ADMIN assignment at the database boundary', async () => {
    const superAdmin = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    const user = await prisma.user.create({ data: { email: `sa-scope-${stamp}@example.invalid`, displayName: 'Scoped SA fixture' } });
    userIds.push(user.id);
    const unit = await prisma.organizationalUnit.create({ data: { name: `SA Scope ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=SA-Scope-${stamp}`, ouPath: `/sa-scope-${stamp}` } });
    await expect(prisma.userRole.create({ data: { userId: user.id, roleId: superAdmin.id, organizationalUnitId: unit.id } })).rejects.toBeDefined();
    expect(await prisma.userRole.count({ where: { userId: user.id, roleId: superAdmin.id } })).toBe(0);
    await prisma.organizationalUnit.delete({ where: { id: unit.id } });
  });
});
