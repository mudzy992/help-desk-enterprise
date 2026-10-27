import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { persistTicketSlaState } from './persist-ticket-sla-state';
import { withTicketSlaWriteLock } from './with-ticket-sla-write-lock';
import { withSlaProfileWriteLock } from './with-sla-profile-write-lock';
import { seedStartingSlaProfiles } from './seed-starting-sla-profiles';
import { startingSlaProfileKeys } from './starting-sla.constants';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('SLA write coordination (integration)', () => {
  jest.setTimeout(120_000);
  let first: PrismaClient;
  let second: PrismaClient;

  beforeAll(() => {
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });
  afterAll(async () => Promise.all([first.$disconnect(), second.$disconnect()]));

  it('serializes scanner and lifecycle work for the same ticket', async () => {
    let active = 0;
    let maximumActive = 0;
    const enter = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active -= 1;
    };
    await Promise.all([
      withTicketSlaWriteLock(first as never, 'ticket-concurrency-proof', enter),
      withTicketSlaWriteLock(second as never, 'ticket-concurrency-proof', enter),
    ]);
    expect(maximumActive).toBe(1);
  });

  it('creates the first timer idempotently and preserves the winning state', async () => {
    const stamp = Date.now();
    const unit = await first.organizationalUnit.create({ data: { name: `SLA race ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=SLA${stamp}`, ouPath: `/sla-${stamp}` } });
    const category = await first.serviceCategory.create({ data: { name: `SLA race ${stamp}`, slug: `sla-race-cat-${stamp}` } });
    const service = await first.service.create({ data: { name: `SLA race ${stamp}`, slug: `sla-race-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await first.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const requester = await first.user.create({ data: { email: `sla-race-${stamp}@example.test`, displayName: 'SLA race' } });
    const ticket = await first.ticket.create({ data: { ticketNumber: `SLA-${stamp}`, title: 'SLA race', description: 'proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'PENDING', serviceId: service.id, formVersionId: form.id, requesterId: requester.id, originUnitId: unit.id } as never });
    const candidate = (startedAt: Date) => ({ ticketId: ticket.id, slaProfileId: null, slaRuleId: null, responseMinutes: 60, resolutionMinutes: 120, startedAt, responseDueAt: null, resolutionDueAt: null, respondedAt: null, resolutionCompletedAt: null, pausedAt: null, pausedBusinessMinutes: 0, isResponseBreached: false, isResolutionBreached: false, isResponseAtRisk: false, isResolutionAtRisk: false, firedEscalationKeys: [], nextDueAt: null });
    const firstCandidate = new Date('2026-01-01T00:00:00.000Z');
    const secondCandidate = new Date('2026-02-01T00:00:00.000Z');
    const results = await Promise.all([
      persistTicketSlaState(first as never, candidate(firstCandidate)),
      persistTicketSlaState(second as never, candidate(secondCandidate)),
    ]);
    const rows = await first.ticketSlaState.findMany({ where: { ticketId: ticket.id } });
    expect(rows).toHaveLength(1);
    expect(results[0]?.id).toBe(rows[0]?.id);
    expect(results[1]?.id).toBe(rows[0]?.id);
    expect([firstCandidate.toISOString(), secondCandidate.toISOString()]).toContain(rows[0]?.startedAt.toISOString());
  });

  it('enforces effective rule keys, escalation offsets, and max levels under concurrency', async () => {
    const stamp = Date.now();
    const calendar = await first.businessHoursCalendar.create({ data: { key: `race-${stamp}`, name: 'Race calendar', timezone: 'UTC', weeklyHours: {} } });
    const profile = await first.slaProfile.create({ data: { key: `race-${stamp}`, name: 'Race profile', calendarId: calendar.id } });
    const duplicateRules = await Promise.allSettled([
      first.slaRule.create({ data: { slaProfileId: profile.id, priority: 'HIGH', responseMinutes: 10, resolutionMinutes: 20, organizationalUnitId: null, serviceId: null } }),
      second.slaRule.create({ data: { slaProfileId: profile.id, priority: 'HIGH', responseMinutes: 30, resolutionMinutes: 40, organizationalUnitId: null, serviceId: null } }),
    ]);
    expect(duplicateRules.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const duplicateOffsets = await Promise.allSettled([
      first.slaEscalationRule.create({ data: { slaProfileId: profile.id, triggerOffsetMinutes: 5, targetRole: 'ADMIN' } }),
      second.slaEscalationRule.create({ data: { slaProfileId: profile.id, triggerOffsetMinutes: 5, targetRole: 'ADMIN' } }),
    ]);
    expect(duplicateOffsets.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const createWithinMaximum = (client: PrismaClient, offset: number) =>
      withSlaProfileWriteLock(client as never, profile.id, async (locked) => {
        const count = await locked.slaEscalationRule.count({ where: { slaProfileId: profile.id } });
        if (count >= 2) return false;
        await locked.slaEscalationRule.create({ data: { slaProfileId: profile.id, triggerOffsetMinutes: offset, targetRole: 'ADMIN' } });
        return true;
      });
    const maxResults = await Promise.all([
      createWithinMaximum(first, 10), createWithinMaximum(second, 15),
    ]);
    expect(maxResults.filter(Boolean)).toHaveLength(1);
    expect(await first.slaEscalationRule.count({ where: { slaProfileId: profile.id } })).toBe(2);
  });

  it('atomically serializes concurrent starting-profile seed and repairs partial ladders', async () => {
    await Promise.all([
      seedStartingSlaProfiles(first as never),
      seedStartingSlaProfiles(second as never),
    ]);
    const profiles = await first.slaProfile.findMany({
      where: { key: { in: [...startingSlaProfileKeys] } },
    });
    expect(profiles).toHaveLength(startingSlaProfileKeys.length);
    for (const profile of profiles) {
      expect(await first.slaRule.count({ where: { slaProfileId: profile.id } })).toBe(4);
      expect(await first.slaEscalationRule.count({ where: { slaProfileId: profile.id } })).toBe(3);
    }

    const incident = profiles.find((profile) => profile.key === 'INCIDENT')!;
    await first.slaEscalationRule.deleteMany({
      where: { slaProfileId: incident.id, triggerOffsetMinutes: { in: [0, 120] } },
    });
    const repaired = await seedStartingSlaProfiles(first as never);
    expect(repaired.profiles.find((profile) => profile.key === 'INCIDENT'))
      .toMatchObject({ created: false, createdEscalationCount: 2 });
    expect(await first.slaEscalationRule.count({ where: { slaProfileId: incident.id } })).toBe(3);
  });

  it('does not globally serialize unrelated tickets', async () => {
    let active = 0;
    let maximumActive = 0;
    const enter = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active -= 1;
    };
    await Promise.all([
      withTicketSlaWriteLock(first as never, 'ticket-independent-a', enter),
      withTicketSlaWriteLock(second as never, 'ticket-independent-b', enter),
    ]);
    expect(maximumActive).toBe(2);
  });
});
