/**
 * Paket 2.7 (§8): incidents against a real PostgreSQL. Runs only when
 * PRIVACY_IT_DATABASE_URL points at a migrated, disposable database.
 * Ticket access is covered by the ticket module's own tests; here it is
 * stubbed so the relational queries (filters, counts, distinct) are what is
 * exercised.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrivacyActor } from '../privacy/privacy-actor';
import { loadOpenIncidentImpacts } from '../service-catalog/load-open-incident-impacts';
import { defaultServiceAvailabilityEvaluationContext } from '../service-catalog/parse-service-availability-configuration';
import { StatusIncidentsService } from './status-incidents.service';
import { StatusPageService, type StatusViewer } from './status-page.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('status page (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let incidents: StatusIncidentsService;
  let page: StatusPageService;
  const stamp = Date.now();
  const ids: Record<string, string> = {};
  let operator: PrivacyActor;
  let requesterView: StatusViewer;
  let staffView: StatusViewer;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const settings = { getSetting: async () => undefined };
    incidents = new StatusIncidentsService(prisma as never, settings as never, {} as never, {} as never);
    // Ticket access is not under test here.
    (incidents as unknown as { assertStaffTicket: () => Promise<void> }).assertStaffTicket = async () => undefined;
    const { now: _now, ...bundle } = defaultServiceAvailabilityEvaluationContext();
    page = new StatusPageService(
      prisma as never,
      { load: async () => ({ enabled: true, public: false, historyDays: 90, showUptimePercent: true }) } as never,
      {} as never,
      {} as never,
      { load: async () => bundle } as never,
    );

    const unit = await prisma.organizationalUnit.create({
      data: { name: 'U', type: 'DIRECTORATE', distinguishedName: `OU=S${stamp}`, ouPath: `/s${stamp}` },
    });
    const category = await prisma.serviceCategory.create({ data: { name: 'Mreža', slug: `sc${stamp}` } });
    const vpn = await prisma.service.create({ data: { name: 'VPN', slug: `vpn${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const mail = await prisma.service.create({ data: { name: 'E-mail', slug: `mail${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: vpn.id, version: 1, schema: {} } });
    const op = await prisma.user.create({ data: { email: `op${stamp}@x.ba`, displayName: 'Operater' } });
    const requester = await prisma.user.create({ data: { email: `req${stamp}@x.ba`, displayName: 'Podnosilac' } });
    const closedRequester = await prisma.user.create({ data: { email: `closed${stamp}@x.ba`, displayName: 'Zatvoren' } });
    const subscriber = await prisma.user.create({ data: { email: `sub${stamp}@x.ba`, displayName: 'Pretplatnik' } });
    const ticket = (number: string, requesterId: string, status: 'IN_PROGRESS' | 'CLOSED') =>
      prisma.ticket.create({
        data: {
          ticketNumber: `S-${number}-${stamp}`,
          title: 'VPN ne radi',
          description: 'Ne mogu se spojiti',
          formData: {},
          priority: 'LOW',
          impact: 'LOW',
          urgency: 'LOW',
          status,
          serviceId: vpn.id,
          formVersionId: form.id,
          requesterId,
          originUnitId: unit.id,
        } as never,
      });
    const open = await ticket('1', requester.id, 'IN_PROGRESS');
    await ticket('2', requester.id, 'IN_PROGRESS');
    await ticket('3', closedRequester.id, 'CLOSED');
    Object.assign(ids, { vpn: vpn.id, mail: mail.id, op: op.id, requester: requester.id, closedRequester: closedRequester.id, subscriber: subscriber.id, ticket: open.id });
    operator = { principal: { subjectId: op.id }, requestId: null, sessionId: null } as unknown as PrivacyActor;
    requesterView = { userId: requester.id, isStaff: false, canManage: false };
    staffView = { userId: op.id, isStaff: true, canManage: true };
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const notificationsFor = (userId: string, type: string) => prisma.notification.count({ where: { userId, type } });

  it('creates an incident, notifies each open-ticket requester once and overlays the service', async () => {
    const started = new Date(Date.now() - 2 * 3_600_000);
    const created = await incidents.create(
      {
        title: 'VPN prekid',
        impact: 'DOWN',
        serviceIds: [ids.vpn],
        message: 'Istražujemo prekid VPN-a',
        startedAt: started.toISOString(),
        notifyOpenTicketHolders: true,
      },
      operator,
    );
    ids.incident = created.id;
    expect(created.notified).toBe(1);
    expect(await notificationsFor(ids.requester, 'status.incidentStarted')).toBe(1);
    expect(await notificationsFor(ids.closedRequester, 'status.incidentStarted')).toBe(0);

    const view = await page.page(requesterView);
    const vpn = view.categories.flatMap((category) => category.services).find((service) => service.id === ids.vpn);
    expect(vpn).toMatchObject({ availability: 'DOWN', incidentIds: [created.id] });
    expect(vpn?.uptimePercent).toBeLessThan(100);
    expect(view.activeIncidents.find((incident) => incident.id === created.id)?.updates[0]).toMatchObject({
      status: 'INVESTIGATING',
      authorName: null,
    });
    expect((await page.page(staffView)).activeIncidents.find((incident) => incident.id === created.id)?.updates[0].authorName).toBe('Operater');

    const impacts = await loadOpenIncidentImpacts(prisma as never, [ids.vpn, ids.mail]);
    expect(impacts.get(ids.vpn)).toBe('DOWN');
    expect(impacts.has(ids.mail)).toBe(false);
  });

  it('keeps STAFF_ONLY incidents away from requesters, the catalog and notifications', async () => {
    const created = await incidents.create(
      { title: 'Interno', impact: 'DEGRADED', visibility: 'STAFF_ONLY', serviceIds: [ids.mail], message: 'Samo za osoblje', notifyOpenTicketHolders: true },
      operator,
    );
    ids.staffIncident = created.id;
    expect(created.notified).toBe(0);
    expect((await page.page(requesterView)).activeIncidents.map((incident) => incident.id)).not.toContain(created.id);
    expect((await page.page(staffView)).activeIncidents.map((incident) => incident.id)).toContain(created.id);
    expect((await loadOpenIncidentImpacts(prisma as never, [ids.mail])).size).toBe(0);
    await expect(incidents.subscribe(created.id, ids.requester, false)).rejects.toMatchObject({ status: 404 });
    expect((await page.openForService(ids.mail, requesterView)).length).toBe(0);
  });

  it('links a ticket once and writes a staff-only system event', async () => {
    expect(await incidents.linkTicket(ids.incident, ids.ticket, operator)).toEqual({ linked: true });
    expect(await incidents.linkTicket(ids.incident, ids.ticket, operator)).toEqual({ linked: false });
    const events = await prisma.ticketMessage.findMany({ where: { ticketId: ids.ticket, type: 'SYSTEM_EVENT' }, select: { body: true } });
    expect(events.map((event) => event.body)).toContain(`ticket_incident_linked:${ids.incident}|VPN prekid`);
    const staff = await page.incident(ids.incident, staffView);
    expect(staff.linkedTicketCount).toBe(1);
    expect((await page.incident(ids.incident, requesterView)).linkedTicketCount).toBeNull();
  });

  it('previews and resolves: subscribers and linked requesters, each once, subscriptions marked', async () => {
    await incidents.subscribe(ids.incident, ids.subscriber, false);
    await incidents.subscribe(ids.incident, ids.requester, false);
    expect((await page.incident(ids.incident, { userId: ids.subscriber, isStaff: false, canManage: false })).subscribed).toBe(true);
    expect(await incidents.resolvePreview(ids.incident)).toEqual({ subscribers: 2, requesters: 1, recipients: 2, linkedTickets: 1 });

    await incidents.addUpdate(ids.incident, { status: 'IDENTIFIED', message: 'Uzrok: certifikat' }, operator);
    await expect(incidents.addUpdate(ids.incident, { status: 'INVESTIGATING', message: 'nazad' }, operator)).rejects.toMatchObject({ status: 409 });
    const result = await incidents.addUpdate(ids.incident, { status: 'RESOLVED', message: 'Certifikat obnovljen' }, operator);
    expect(result.notified).toBe(2);
    expect(await notificationsFor(ids.subscriber, 'status.incidentResolved')).toBe(1);
    expect(await notificationsFor(ids.requester, 'status.incidentResolved')).toBe(1);
    const pending = await prisma.serviceIncidentSubscription.count({ where: { incidentId: ids.incident, notifiedAt: null } });
    expect(pending).toBe(0);
    const events = await prisma.ticketMessage.findMany({ where: { ticketId: ids.ticket, type: 'SYSTEM_EVENT' }, select: { body: true } });
    expect(events.map((event) => event.body)).toContain(`ticket_incident_resolved:${ids.incident}|VPN prekid`);

    const view = await page.page(requesterView);
    expect(view.activeIncidents.map((incident) => incident.id)).not.toContain(ids.incident);
    const resolved = view.history.find((incident) => incident.id === ids.incident);
    expect(resolved?.updates.map((update) => update.status)).toEqual(['RESOLVED', 'IDENTIFIED', 'INVESTIGATING']);
    expect(resolved?.resolvedAt).not.toBeNull();
    const vpn = view.categories.flatMap((category) => category.services).find((service) => service.id === ids.vpn);
    expect(vpn?.availability).toBe('OPERATIONAL');
    expect(vpn?.uptimePercent).toBeLessThan(100);
    expect((await loadOpenIncidentImpacts(prisma as never, [ids.vpn])).size).toBe(0);

    await expect(incidents.addUpdate(ids.incident, { status: 'RESOLVED', message: 'opet' }, operator)).rejects.toMatchObject({ status: 409 });
    await expect(incidents.edit(ids.incident, { title: 'Novo' }, operator)).rejects.toMatchObject({ status: 409 });
  });

  it('edits services of an open incident and records the change', async () => {
    await incidents.edit(ids.staffIncident, { serviceIds: [ids.vpn, ids.mail], impact: 'DOWN' }, operator);
    const updated = await page.incident(ids.staffIncident, staffView);
    expect(updated.services.map((service) => service.id).sort()).toEqual([ids.vpn, ids.mail].sort());
    expect(updated.impact).toBe('DOWN');
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ids.staffIncident, action: 'status.incident.edited' },
      select: { metadata: true },
    });
    expect(audit?.metadata).toMatchObject({ changed: ['impact', 'services'], impact: { from: 'DEGRADED', to: 'DOWN' } });
  });
});
