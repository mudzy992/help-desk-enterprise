import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { listSlaProfiles } from './list-sla-profiles';
import { listSlaRules } from './list-sla-rules';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('scoped paginated SLA administration reads (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); });
  afterAll(async () => prisma.$disconnect());

  it('proves global, OU/service, sibling denial and stable cursor boundaries in PostgreSQL', async () => {
    const stamp = Date.now();
    const root = await prisma.organizationalUnit.create({ data: { name: `SLA root ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=SlaRoot${stamp}`, ouPath: `/sla-${stamp}/` } });
    const child = await prisma.organizationalUnit.create({ data: { name: `SLA child ${stamp}`, type: 'SERVICE', distinguishedName: `OU=SlaChild${stamp}`, ouPath: `/sla-${stamp}/child/`, parentId: root.id } });
    const sibling = await prisma.organizationalUnit.create({ data: { name: `SLA sibling ${stamp}`, type: 'SERVICE', distinguishedName: `OU=SlaSibling${stamp}`, ouPath: `/sibling-${stamp}/`, parentId: root.id } });
    const category = await prisma.serviceCategory.create({ data: { name: `SLA scope ${stamp}`, slug: `sla-scope-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `SLA allowed ${stamp}`, slug: `sla-allowed-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const otherService = await prisma.service.create({ data: { name: `SLA denied ${stamp}`, slug: `sla-denied-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const calendar = await prisma.businessHoursCalendar.create({ data: { key: `scope-${stamp}`, name: `Scope ${stamp}`, timezone: 'UTC', weeklyHours: {} } });
    const profile = await prisma.slaProfile.create({ data: { key: `scope-${stamp}`, name: `Scope ${stamp}`, calendarId: calendar.id } });
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
    const [globalRule, childRule, siblingRule, serviceRule, otherServiceRule] = await Promise.all([
      prisma.slaRule.create({ data: { slaProfileId: profile.id, priority: priorities[0], responseMinutes: 10, resolutionMinutes: 20 } }),
      prisma.slaRule.create({ data: { slaProfileId: profile.id, priority: priorities[1], responseMinutes: 10, resolutionMinutes: 20, organizationalUnitId: child.id } }),
      prisma.slaRule.create({ data: { slaProfileId: profile.id, priority: priorities[2], responseMinutes: 10, resolutionMinutes: 20, organizationalUnitId: sibling.id } }),
      prisma.slaRule.create({ data: { slaProfileId: profile.id, priority: priorities[3], responseMinutes: 10, resolutionMinutes: 20, serviceId: service.id } }),
      prisma.slaRule.create({ data: { slaProfileId: profile.id, priority: priorities[0], responseMinutes: 11, resolutionMinutes: 21, serviceId: otherService.id } }),
    ]);
    const global = await listSlaRules(prisma as never, profile.id, { scope: { global: true, organizationalUnitPaths: [], serviceIds: [] }, take: 100 });
    expect(global.items.map((row) => row.id)).toEqual(expect.arrayContaining([globalRule.id, childRule.id, siblingRule.id, serviceRule.id, otherServiceRule.id]));
    const scoped = await listSlaRules(prisma as never, profile.id, { scope: { global: false, organizationalUnitPaths: [root.ouPath], serviceIds: [service.id] }, take: 100 });
    expect(scoped.items.map((row) => row.id)).toEqual(expect.arrayContaining([globalRule.id, childRule.id, serviceRule.id]));
    expect(scoped.items.map((row) => row.id)).not.toEqual(expect.arrayContaining([siblingRule.id, otherServiceRule.id]));
    const first = await listSlaRules(prisma as never, profile.id, { scope: { global: true, organizationalUnitPaths: [], serviceIds: [] }, take: 2 });
    expect(first).toMatchObject({ hasMore: true, total: 5 });
    const second = await listSlaRules(prisma as never, profile.id, { scope: { global: true, organizationalUnitPaths: [], serviceIds: [] }, take: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items.map((row) => row.id).some((id) => first.items.some((row) => row.id === id))).toBe(false);
    const profiles = await listSlaProfiles(prisma as never, { scope: { global: false, organizationalUnitPaths: [root.ouPath], serviceIds: [] }, take: 1 });
    expect(profiles.items.map((row) => row.id)).toContain(profile.id);
  });
});
