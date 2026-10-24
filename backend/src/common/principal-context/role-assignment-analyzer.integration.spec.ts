import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { analyzeRoleAssignments } from './role-assignment-analyzer';
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
describeIfDatabase('canonical role assignment inventory (integration)', () => {
  let prisma: PrismaClient; const stamp = Date.now(); const ids: string[] = [];
  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); });
  afterAll(async () => { if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } }); await prisma.role.deleteMany({ where: { key: { startsWith: `IT_SCOPE_${stamp}` } } }); await prisma.$disconnect(); });
  it('reports persisted duplicate and ambiguous rows without changing them', async () => {
    const [user, role] = await Promise.all([
      prisma.user.create({ data: { email: `scope-${stamp}@example.invalid`, displayName: 'Scope fixture' } }),
      prisma.role.create({ data: { key: `IT_SCOPE_${stamp}`, name: 'Scope fixture' } }),
    ]); ids.push(user.id);
    const category = await prisma.serviceCategory.create({ data: { name: `Scope ${stamp}`, slug: `scope-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Scope ${stamp}`, slug: `scope-service-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const unit = await prisma.organizationalUnit.create({ data: { name: `Scope ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=Scope-${stamp}`, ouPath: `/scope-${stamp}` } });
    await prisma.userRole.createMany({ data: [
      { userId: user.id, roleId: role.id }, { userId: user.id, roleId: role.id },
      { userId: user.id, roleId: role.id, organizationalUnitId: unit.id, serviceId: service.id },
    ] });
    const rows = await prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true, user: true }, orderBy: { id: 'asc' } });
    const manifest = analyzeRoleAssignments(rows.map((row) => ({ id: row.id, userId: row.userId, roleId: row.roleId, roleKey: row.role.key, userIsActive: row.user.isActive, userIsLocalOnly: row.user.isLocalOnly, organizationalUnitId: row.organizationalUnitId, serviceId: row.serviceId })));
    expect(manifest.anomalies.map(({ code }) => code).sort()).toEqual(['AMBIGUOUS_SCOPE', 'DUPLICATE_ASSIGNMENT']);
    expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(3);
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.service.delete({ where: { id: service.id } }); await prisma.serviceCategory.delete({ where: { id: category.id } }); await prisma.organizationalUnit.delete({ where: { id: unit.id } });
  });
});
