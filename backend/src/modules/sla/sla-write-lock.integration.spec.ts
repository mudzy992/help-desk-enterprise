import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { persistTicketSlaState } from './persist-ticket-sla-state';
import { withTicketSlaWriteLock } from './with-ticket-sla-write-lock';
import { withSlaProfileWriteLock } from './with-sla-profile-write-lock';
import { seedStartingSlaProfiles } from './seed-starting-sla-profiles';
import { startingSlaProfileKeys } from './starting-sla.constants';
import { previewSlaTimerConfigurationMigration, SlaTimerConfigurationMigrationService } from './sla-timer-configuration-migration.service';
import { defaultSlaConfiguration } from './create-sla-service-harness';
import { resolveSlaNotificationRecipients } from '../notifications/fan-out/resolve-sla-notification-recipients';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';

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

  it('previews and applies a bounded, audited configuration recompute', async () => {
    const stamp = Date.now();
    const calendar = await first.businessHoursCalendar.create({ data: { key: `migration-${stamp}`, name: 'Migration calendar', timezone: 'UTC', weeklyHours: { '1': [{ start: '00:00', end: '23:59' }], '2': [{ start: '00:00', end: '23:59' }], '3': [{ start: '00:00', end: '23:59' }], '4': [{ start: '00:00', end: '23:59' }], '5': [{ start: '00:00', end: '23:59' }] } } });
    const profile = await first.slaProfile.create({ data: { key: `migration-${stamp}`, name: 'Migration profile', calendarId: calendar.id } });
    const rule = await first.slaRule.create({ data: { slaProfileId: profile.id, priority: 'LOW', responseMinutes: 60, resolutionMinutes: 120, organizationalUnitId: null, serviceId: null } });
    const unit = await first.organizationalUnit.create({ data: { name: `Migration ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=MIG${stamp}`, ouPath: `/migration-${stamp}` } });
    const category = await first.serviceCategory.create({ data: { name: `Migration ${stamp}`, slug: `migration-cat-${stamp}` } });
    const service = await first.service.create({ data: { name: `Migration ${stamp}`, slug: `migration-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE', slaProfileId: profile.id } });
    const form = await first.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const requester = await first.user.create({ data: { email: `migration-${stamp}@example.test`, displayName: 'Migration proof' } });
    const ticket = await first.ticket.create({ data: { ticketNumber: `MIG-${stamp}`, title: 'Migration proof', description: 'proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'PENDING', serviceId: service.id, formVersionId: form.id, requesterId: requester.id, originUnitId: unit.id } as never });
    await first.ticketSlaState.create({ data: { ticketId: ticket.id, slaProfileId: profile.id, slaRuleId: rule.id, responseMinutes: 30, resolutionMinutes: 90, startedAt: ticket.createdAt, responseDueAt: new Date(ticket.createdAt.getTime() + 30 * 60_000), resolutionDueAt: new Date(ticket.createdAt.getTime() + 90 * 60_000), configurationVersion: 'old-version', configurationPolicy: 'GRANDFATHER' } });

    const preview = await previewSlaTimerConfigurationMigration(first as never, { slaProfileId: profile.id, take: 1 });
    expect(preview).toMatchObject({ scanned: 1, drifted: 1, unresolved: 0, unchanged: 0 });
    const migrations = new SlaTimerConfigurationMigrationService(first as never, { load: async () => defaultSlaConfiguration } as never);
    const applied = await migrations.apply({ slaProfileId: profile.id, take: 1, previewToken: preview.previewToken, reason: 'Apply approved SLA configuration', actorUserId: null });
    expect(applied.migrated).toBe(1);
    const migrated = await first.ticketSlaState.findUnique({ where: { ticketId: ticket.id } });
    expect(migrated).toMatchObject({ responseMinutes: 60, resolutionMinutes: 120, configurationPolicy: 'RECOMPUTE' });
    expect(migrated?.configurationVersion).toHaveLength(64);
    expect(await first.changeLog.count({ where: { entityType: 'ticket_sla_configuration', entityId: migrated?.id } })).toBe(1);
  });

  it('filters inactive and out-of-scope escalation recipients on PostgreSQL', async () => {
    const stamp = Date.now();
    const root = await first.organizationalUnit.create({ data: { name: `Scope root ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=ROOT${stamp}`, ouPath: `/scope-${stamp}` } });
    const child = await first.organizationalUnit.create({ data: { name: `Scope child ${stamp}`, type: 'OFFICE', distinguishedName: `OU=CHILD${stamp}`, ouPath: `${root.ouPath}/child`, parentId: root.id } });
    const outside = await first.organizationalUnit.create({ data: { name: `Scope outside ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=OUT${stamp}`, ouPath: `/outside-${stamp}` } });
    const category = await first.serviceCategory.create({ data: { name: `Recipient ${stamp}`, slug: `recipient-cat-${stamp}` } });
    const service = await first.service.create({ data: { name: `Recipient ${stamp}`, slug: `recipient-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const group = await first.group.create({ data: { key: `recipient-${stamp}`, name: 'Recipient group', organizationalUnitId: root.id } });
    const active = await first.user.create({ data: { email: `recipient-active-${stamp}@example.test`, displayName: 'Active recipient', organizationalUnitId: child.id } });
    const inactive = await first.user.create({ data: { email: `recipient-inactive-${stamp}@example.test`, displayName: 'Inactive recipient', organizationalUnitId: child.id, isActive: false } });
    const outsideUser = await first.user.create({ data: { email: `recipient-outside-${stamp}@example.test`, displayName: 'Outside recipient', organizationalUnitId: outside.id } });
    await first.groupMember.createMany({ data: [{ groupId: group.id, userId: active.id }, { groupId: group.id, userId: inactive.id }] });
    const calendar = await first.businessHoursCalendar.create({ data: { key: `recipient-${stamp}`, name: 'Recipient calendar', timezone: 'UTC', weeklyHours: {} } });
    const profile = await first.slaProfile.create({ data: { key: `recipient-${stamp}`, name: 'Recipient profile', calendarId: calendar.id } });
    const groupRule = await first.slaEscalationRule.create({ data: { slaProfileId: profile.id, triggerOffsetMinutes: 0, targetGroupId: group.id } });
    const ticket = { id: `recipient-ticket-${stamp}`, originUnitId: child.id, serviceId: service.id, assignedGroupId: group.id, assignedUserId: null };
    expect(await resolveSlaNotificationRecipients(first as never, { ticket: ticket as never, event: ticketSystemEventActions.slaResponseEscalated, messageBody: `${ticketSystemEventActions.slaResponseEscalated}:${groupRule.id}` })).toEqual([active.id]);

    const role = await first.role.create({ data: { key: `recipient-role-${stamp}`, name: 'Recipient role' } });
    await first.userRole.createMany({ data: [
      { userId: active.id, roleId: role.id, organizationalUnitId: root.id },
      { userId: outsideUser.id, roleId: role.id, organizationalUnitId: outside.id },
    ] });
    const roleRule = await first.slaEscalationRule.create({ data: { slaProfileId: profile.id, triggerOffsetMinutes: 5, targetRole: role.key } });
    expect(await resolveSlaNotificationRecipients(first as never, { ticket: ticket as never, event: ticketSystemEventActions.slaResolutionEscalated, messageBody: `${ticketSystemEventActions.slaResolutionEscalated}:${roleRule.id}` })).toEqual([active.id]);

    const emptyRule = await first.slaEscalationRule.create({ data: { slaProfileId: profile.id, triggerOffsetMinutes: 10, targetUserId: inactive.id } });
    const emptyTicket = { ...ticket, id: `recipient-empty-${stamp}`, assignedGroupId: null, assignedUserId: null };
    expect(await resolveSlaNotificationRecipients(first as never, { ticket: emptyTicket as never, event: ticketSystemEventActions.slaResponseEscalated, messageBody: `${ticketSystemEventActions.slaResponseEscalated}:${emptyRule.id}` })).toEqual([]);
    expect(await first.auditLog.count({ where: { action: 'sla.escalation.audience_empty', entityId: emptyTicket.id } })).toBe(1);
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
