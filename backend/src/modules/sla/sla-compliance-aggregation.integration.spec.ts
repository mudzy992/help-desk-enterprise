import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { loadBoundedSlaCompliance } from './load-bounded-sla-compliance';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('bounded SLA compliance aggregation (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); });
  afterAll(async () => prisma.$disconnect());

  it('aggregates in PostgreSQL and returns bounded dimension rows', async () => {
    const stamp = Date.now();
    const unit = await prisma.organizationalUnit.create({ data: { name: `Compliance ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=C${stamp}`, ouPath: `/c-${stamp}` } });
    const category = await prisma.serviceCategory.create({ data: { name: `Compliance ${stamp}`, slug: `compliance-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Compliance ${stamp}`, slug: `compliance-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const requester = await prisma.user.create({ data: { email: `compliance-${stamp}@example.test`, displayName: 'Compliance' } });
    const calendar = await prisma.businessHoursCalendar.create({ data: { key: `compliance-${stamp}`, name: 'Compliance', timezone: 'UTC', weeklyHours: {} } });
    const profile = await prisma.slaProfile.create({ data: { key: `compliance-${stamp}`, name: 'Compliance', calendarId: calendar.id } });
    const completion = new Date('2026-10-20T12:00:00Z');
    const ticket = await prisma.ticket.create({ data: { ticketNumber: `C-${stamp}`, title: 'Compliance', description: 'proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'RESOLVED', resolvedAt: completion, serviceId: service.id, formVersionId: form.id, requesterId: requester.id, originUnitId: unit.id } as never });
    await prisma.ticketSlaState.create({ data: { ticketId: ticket.id, slaProfileId: profile.id, startedAt: new Date('2026-10-19T12:00:00Z'), isResponseBreached: false, isResolutionBreached: true } });
    const result = await loadBoundedSlaCompliance(prisma as never, { organizationalUnitIds: [unit.id], window: { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-31T23:59:59Z') } });
    expect(result.profiles.find((row) => row.slaProfileId === profile.id)).toMatchObject({ sampleCount: 1, responseCompliancePercent: 100, resolutionCompliancePercent: 0 });
    expect(result.byUnit).toEqual(expect.arrayContaining([expect.objectContaining({ dimensionId: unit.id, sampleCount: 1 })]));
    expect(result.byService).toEqual(expect.arrayContaining([expect.objectContaining({ dimensionId: service.id, sampleCount: 1 })]));
  });
});
