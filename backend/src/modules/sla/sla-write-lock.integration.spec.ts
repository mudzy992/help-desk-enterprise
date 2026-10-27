import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { persistTicketSlaState } from './persist-ticket-sla-state';
import { withTicketSlaWriteLock } from './with-ticket-sla-write-lock';

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
