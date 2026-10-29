/**
 * Paket 2.7 (§8): incidents against a real PostgreSQL. Runs only when
 * PRIVACY_IT_DATABASE_URL points at a migrated, disposable database.
 * Ticket access is covered by the ticket module's own tests; here it is
 * stubbed so the relational queries (filters, counts, distinct) are what is
 * exercised.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { AuthorizationService } from '../authorization/authorization.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { PrivacyActor } from '../privacy/privacy-actor';
import { loadOpenIncidentImpacts } from '../service-catalog/load-open-incident-impacts';
import { defaultServiceAvailabilityEvaluationContext } from '../service-catalog/parse-service-availability-configuration';
import { StatusIncidentsService } from './status-incidents.service';
import {
  statusIncidentResolutionDeliveryTopic,
  statusIncidentResolutionTicketEventTopic,
  statusIncidentStartDeliveryTopic,
} from './status-incident-start-delivery.constants';
import { StatusIncidentStartDeliveryService } from './status-incident-start-delivery.service';
import { loadUptimePercentByService, StatusPageService, type StatusViewer } from './status-page.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('status page (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let incidents: StatusIncidentsService;
  let startDelivery: StatusIncidentStartDeliveryService;
  let page: StatusPageService;
  const stamp = Date.now();
  const ids: Record<string, string> = {};
  let operator: PrivacyActor;
  let requesterView: StatusViewer;
  let staffView: StatusViewer;
  let vpnScopedView: StatusViewer;
  let mailScopedView: StatusViewer;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const settings = { getSetting: async () => undefined };
    const authorization = new AuthorizationService(
      {
        loadBySubjectId: async (subjectId: string): Promise<AuthorizationContext | null> => {
          if (subjectId === ids.op) {
            return {
              subjectId,
              isLocalOnly: true,
              isSuperAdmin: false,
              assignments: [{ roleKey: 'ADMIN', permissionKeys: [permissionKeys.statusIncidentsManage], organizationalUnitId: null, organizationalUnitPath: null, serviceId: null }],
            };
          }
          if (subjectId === ids.scoped) {
            return {
              subjectId,
              isLocalOnly: true,
              isSuperAdmin: false,
              assignments: [{ roleKey: 'ADMIN', permissionKeys: [permissionKeys.statusIncidentsManage], organizationalUnitId: null, organizationalUnitPath: null, serviceId: ids.vpn }],
            };
          }
          return null;
        },
      } as never,
      prisma as never,
    );
    const publicCache = { getVersion: async () => 0, bumpVersion: async () => undefined };
    incidents = new StatusIncidentsService(prisma as never, {} as never, {} as never, authorization, publicCache as never);
    startDelivery = new StatusIncidentStartDeliveryService(prisma as never, new TransactionalOutboxService(prisma as never), settings as never);
    // Ticket access is not under test here.
    (incidents as unknown as { assertStaffTickets: () => Promise<void> }).assertStaffTickets = async () => undefined;
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
    const scoped = await prisma.user.create({ data: { email: `scoped${stamp}@x.ba`, displayName: 'VPN administrator' } });
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
    Object.assign(ids, { vpn: vpn.id, mail: mail.id, op: op.id, scoped: scoped.id, requester: requester.id, closedRequester: closedRequester.id, subscriber: subscriber.id, ticket: open.id });
    operator = { principal: { subjectId: op.id }, requestId: null, sessionId: null } as unknown as PrivacyActor;
    requesterView = { userId: requester.id, isStaff: false, canManage: false };
    staffView = { userId: op.id, isStaff: true, canManage: true };
    vpnScopedView = { userId: op.id, isStaff: true, canManage: false, staffScope: { global: false, serviceIds: [vpn.id], organizationalUnitPaths: [] } };
    mailScopedView = { userId: op.id, isStaff: true, canManage: false, staffScope: { global: false, serviceIds: [mail.id], organizationalUnitPaths: [] } };
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
    expect(created.notified).toBe(0);
    expect(await prisma.outboxMessage.count({ where: { topic: statusIncidentStartDeliveryTopic, dedupeKey: created.id, status: 'PENDING' } })).toBe(1);
    expect(await startDelivery.runSweep()).toBe(1);
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

  it('aggregates overlapping uptime spans in SQL without materializing incident rows', async () => {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 4 * 3_600_000);
    const first = await prisma.serviceIncident.create({
      data: {
        title: 'SQL uptime overlap A', impact: 'DOWN', status: 'RESOLVED', visibility: 'ALL_USERS',
        startedAt: windowStart, resolvedAt: new Date(windowStart.getTime() + 2 * 3_600_000), createdByUserId: ids.op,
        services: { create: { serviceId: ids.mail } },
      },
    });
    const second = await prisma.serviceIncident.create({
      data: {
        title: 'SQL uptime overlap B', impact: 'DOWN', status: 'RESOLVED', visibility: 'ALL_USERS',
        startedAt: new Date(windowStart.getTime() + 3_600_000), resolvedAt: new Date(windowStart.getTime() + 3 * 3_600_000), createdByUserId: ids.op,
        services: { create: { serviceId: ids.mail } },
      },
    });
    try {
      const result = await loadUptimePercentByService(prisma as never, [ids.mail], windowStart, windowEnd);
      expect(result.get(ids.mail)).toBe(25);
    } finally {
      await prisma.serviceIncident.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    }
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
    await expect(incidents.subscribe(created.id, requesterView as StatusViewer & { userId: string })).rejects.toMatchObject({ status: 404 });
    expect((await page.openForService(ids.mail, requesterView)).length).toBe(0);
  });

  it('locks and authorizes a ticket batch inside the incident-create transaction', async () => {
    const transactionalPublicCache = { getVersion: async () => 0, bumpVersion: async () => undefined };
    const transactional = new StatusIncidentsService(
      prisma as never,
      { loadBySubjectId: async () => ({ subjectId: ids.op, isLocalOnly: true, isSuperAdmin: true, assignments: [] }) } as never,
      { bind: async () => ({ actorUserId: ids.op }) } as never,
      { authorizeResource: async () => ({ allowed: true, reason: 'SUPER_ADMIN_ALLOWED' }) } as never,
      transactionalPublicCache as never,
    );
    const title = `Batched ticket auth ${stamp}`;
    const before = await prisma.serviceIncident.count({ where: { title } });
    await expect(transactional.create(
      { title, impact: 'DEGRADED', serviceIds: [ids.vpn], message: 'Atomic batch failure', ticketIds: [ids.ticket, 'missing-ticket'] },
      operator,
    )).rejects.toMatchObject({ status: 404 });
    expect(await prisma.serviceIncident.count({ where: { title } })).toBe(before);

    const created = await transactional.create(
      { title, impact: 'DEGRADED', serviceIds: [ids.vpn], message: 'Atomic batch success', ticketIds: [ids.ticket] },
      operator,
    );
    expect(await prisma.ticketIncidentLink.count({ where: { incidentId: created.id, ticketId: ids.ticket } })).toBe(1);
    await prisma.serviceIncident.delete({ where: { id: created.id } });
  });

  it('enforces status.incidents.manage against every affected service on real PostgreSQL', async () => {
    const scopedActor = { principal: { subjectId: ids.scoped }, requestId: 'scope-it', sessionId: null } as unknown as PrivacyActor;
    await expect(
      incidents.create({ title: 'Mail foreign', impact: 'DEGRADED', serviceIds: [ids.mail], message: 'Ne smije proći' }, scopedActor),
    ).rejects.toMatchObject({ status: 403, response: { code: 'INCIDENT_MANAGE_FORBIDDEN' } });
    await expect(incidents.edit(ids.staffIncident, { impact: 'DOWN' }, scopedActor)).rejects.toMatchObject({ status: 404 });
    await expect(incidents.addUpdate(ids.staffIncident, { status: 'IDENTIFIED', message: 'Neovlašten update' }, scopedActor)).rejects.toMatchObject({ status: 404 });
    await expect(incidents.resolvePreview(ids.staffIncident, scopedActor)).rejects.toMatchObject({ status: 404 });
    const linksBefore = await prisma.ticketIncidentLink.count({ where: { ticketId: ids.ticket } });
    const eventsBefore = await prisma.ticketMessage.count({ where: { ticketId: ids.ticket, type: 'SYSTEM_EVENT' } });
    await expect(incidents.linkTicket(ids.staffIncident, ids.ticket, scopedActor)).rejects.toMatchObject({ status: 404 });
    await expect(incidents.unlinkTicket(ids.staffIncident, ids.ticket, scopedActor)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.ticketIncidentLink.count({ where: { ticketId: ids.ticket } })).toBe(linksBefore);
    expect(await prisma.ticketMessage.count({ where: { ticketId: ids.ticket, type: 'SYSTEM_EVENT' } })).toBe(eventsBefore);

    const own = await incidents.create(
      { title: 'VPN scoped', impact: 'DEGRADED', serviceIds: [ids.vpn], message: 'Dozvoljen scoped incident' },
      scopedActor,
    );
    ids.scopedIncident = own.id;
    await expect(incidents.linkTicket(own.id, ids.ticket, scopedActor)).resolves.toEqual({ linked: true });
    await expect(incidents.unlinkTicket(own.id, ids.ticket, scopedActor)).resolves.toEqual({ unlinked: true });
    await expect(incidents.edit(own.id, { serviceIds: [ids.vpn, ids.mail] }, scopedActor)).rejects.toMatchObject({ status: 403 });
    await expect(incidents.addUpdate(own.id, { status: 'IDENTIFIED', message: 'Scoped update prolazi' }, scopedActor)).resolves.toEqual({ notified: 0 });
    await expect(
      incidents.addUpdate(own.id, { status: 'RESOLVED', message: 'Scoped incident zatvoren', notifyOnResolve: false }, scopedActor),
    ).resolves.toEqual({ notified: 0 });
    expect(await startDelivery.runSweep()).toBe(1);
  });

  it('enforces service-scoped STAFF_ONLY reads across overview, incident and service paths', async () => {
    await incidents.subscribe(ids.staffIncident, { ...mailScopedView, userId: ids.subscriber });

    const mailOverview = await page.page(mailScopedView);
    const visible = mailOverview.activeIncidents.find((incident) => incident.id === ids.staffIncident);
    expect(visible).toMatchObject({ subscriberCount: 1 });
    expect(visible?.updates[0].authorName).toBe('Operater');
    expect((await page.openForService(ids.mail, mailScopedView)).map((incident) => incident.id)).toContain(ids.staffIncident);
    expect((await page.incident(ids.staffIncident, mailScopedView)).id).toBe(ids.staffIncident);

    expect((await page.page(vpnScopedView)).activeIncidents.map((incident) => incident.id)).not.toContain(ids.staffIncident);
    expect(await page.openForService(ids.mail, vpnScopedView)).toEqual([]);
    await expect(page.incident(ids.staffIncident, vpnScopedView)).rejects.toMatchObject({ status: 404 });
  });

  it('atomically revokes public subscribers when visibility becomes STAFF_ONLY', async () => {
    const created = await incidents.create(
      { title: 'Visibility transition', impact: 'DEGRADED', serviceIds: [ids.mail], message: 'Public update' },
      operator,
    );
    await incidents.subscribe(created.id, requesterView as StatusViewer & { userId: string });
    expect(await prisma.serviceIncidentSubscription.count({ where: { incidentId: created.id } })).toBe(1);

    await incidents.edit(created.id, { visibility: 'STAFF_ONLY' }, operator);
    expect(await prisma.serviceIncidentSubscription.count({ where: { incidentId: created.id } })).toBe(0);
    await expect(incidents.subscribe(created.id, requesterView as StatusViewer & { userId: string })).rejects.toMatchObject({ status: 404 });
    await expect(incidents.subscribe(created.id, { ...vpnScopedView, userId: ids.scoped })).rejects.toMatchObject({ status: 404 });

    await incidents.subscribe(created.id, { ...mailScopedView, userId: ids.subscriber });
    const requesterBefore = await notificationsFor(ids.requester, 'status.incidentResolved');
    const subscriberBefore = await notificationsFor(ids.subscriber, 'status.incidentResolved');
    expect(await incidents.addUpdate(created.id, { status: 'RESOLVED', message: 'Internal resolution' }, operator)).toEqual({ notified: 0 });
    expect(await startDelivery.runSweep()).toBe(2);
    expect(await notificationsFor(ids.requester, 'status.incidentResolved')).toBe(requesterBefore);
    expect(await notificationsFor(ids.subscriber, 'status.incidentResolved')).toBe(subscriberBefore + 1);
  });

  it('bounds embedded timelines and keyset-paginates the complete timeline', async () => {
    const created = await incidents.create(
      { title: 'Duga vremenska linija', impact: 'DEGRADED', visibility: 'STAFF_ONLY', serviceIds: [ids.vpn], message: 'Početna objava' },
      operator,
    );
    await prisma.serviceIncidentUpdate.createMany({
      data: Array.from({ length: 24 }, (_, index) => ({
        incidentId: created.id,
        status: 'INVESTIGATING',
        message: `Objava ${index + 1}`,
        authorUserId: ids.op,
        createdAt: new Date(Date.now() + index * 1_000),
      })),
    });
    const embedded = await page.incident(created.id, staffView);
    expect(embedded.updates).toHaveLength(20);
    expect(embedded.updatesHasMore).toBe(true);
    expect(embedded.updatesNextCursor).toBe(embedded.updates.at(-1)?.id);

    const first = await page.timeline(created.id, staffView, { take: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    const second = await page.timeline(created.id, staffView, { take: 10, cursor: first.nextCursor ?? undefined });
    expect(second.items).toHaveLength(10);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(20);
    const tail = await page.timeline(created.id, staffView, { take: 10, cursor: second.nextCursor ?? undefined });
    expect(tail.items).toHaveLength(5);
    expect(tail).toMatchObject({ hasMore: false, nextCursor: null });
    await expect(page.timeline(created.id, mailScopedView, { take: 10 })).rejects.toMatchObject({ status: 404 });
    await incidents.addUpdate(created.id, { status: 'RESOLVED', message: 'Testna vremenska linija je zatvorena', notifyOnResolve: false }, operator);
    expect(await startDelivery.runSweep()).toBe(1);
  });

  it('rejects stale concurrent edits and stale links after resolution', async () => {
    const created = await incidents.create(
      { title: 'Concurrency incident', impact: 'DEGRADED', serviceIds: [ids.vpn], message: 'Concurrency test' },
      operator,
    );
    const revision = (await page.incident(created.id, staffView)).revision;
    const outcomes = await Promise.allSettled([
      incidents.edit(created.id, { title: 'Concurrent winner A' }, operator, revision),
      incidents.edit(created.id, { title: 'Concurrent winner B' }, operator, revision),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ status: 409, response: { code: 'INCIDENT_CHANGED' } });

    const beforeResolve = (await page.incident(created.id, staffView)).revision;
    await incidents.addUpdate(created.id, { status: 'RESOLVED', message: 'Concurrency test resolved', notifyOnResolve: false }, operator);
    expect(await startDelivery.runSweep()).toBe(1);
    const linksBefore = await prisma.ticketIncidentLink.count({ where: { incidentId: created.id } });
    await expect(incidents.linkTicket(created.id, ids.ticket, operator, beforeResolve)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.ticketIncidentLink.count({ where: { incidentId: created.id } })).toBe(linksBefore);
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
    await incidents.subscribe(ids.incident, { ...requesterView, userId: ids.subscriber });
    await incidents.subscribe(ids.incident, requesterView as StatusViewer & { userId: string });
    expect((await page.incident(ids.incident, { userId: ids.subscriber, isStaff: false, canManage: false })).subscribed).toBe(true);
    expect(await incidents.resolvePreview(ids.incident, operator)).toEqual({ subscribers: 2, requesters: 1, recipients: 2, linkedTickets: 1 });

    await incidents.addUpdate(ids.incident, { status: 'IDENTIFIED', message: 'Uzrok: certifikat' }, operator);
    await expect(incidents.addUpdate(ids.incident, { status: 'INVESTIGATING', message: 'nazad' }, operator)).rejects.toMatchObject({ status: 409 });
    const subscriberBefore = await notificationsFor(ids.subscriber, 'status.incidentResolved');
    const requesterBefore = await notificationsFor(ids.requester, 'status.incidentResolved');
    const result = await incidents.addUpdate(ids.incident, { status: 'RESOLVED', message: 'Certifikat obnovljen' }, operator);
    expect(result.notified).toBe(0);
    expect(await prisma.outboxMessage.count({ where: { topic: statusIncidentResolutionDeliveryTopic, dedupeKey: `resolution:${ids.incident}`, status: 'PENDING' } })).toBe(1);
    expect(await prisma.outboxMessage.count({ where: { topic: statusIncidentResolutionTicketEventTopic, dedupeKey: `resolution-events:${ids.incident}`, status: 'PENDING' } })).toBe(1);
    expect(await startDelivery.runSweep()).toBe(2);
    expect(await notificationsFor(ids.subscriber, 'status.incidentResolved')).toBe(subscriberBefore + 1);
    expect(await notificationsFor(ids.requester, 'status.incidentResolved')).toBe(requesterBefore + 1);
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

  it('audit records title and titleEn from/to on incident edit', async () => {
    await incidents.edit(ids.staffIncident, { title: 'Interno obnavlja se', titleEn: 'Internal under repair' }, operator);
    const audits = await prisma.auditLog.findMany({
      where: { entityId: ids.staffIncident, action: 'status.incident.edited' },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { metadata: true },
    });
    expect(audits[0]?.metadata).toMatchObject({
      title: { from: 'Interno', to: 'Interno obnavlja se' },
      titleEn: { from: null, to: 'Internal under repair' },
    });
  });

  it('audit records services added/removed on incident edit', async () => {
    const created = await incidents.create(
      { title: 'Service delta audit', impact: 'DEGRADED', visibility: 'STAFF_ONLY', serviceIds: [ids.mail], message: 'Prije izmjene' },
      operator,
    );
    await incidents.edit(created.id, { serviceIds: [ids.vpn] }, operator);
    const audits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'status.incident.edited' },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { metadata: true },
    });
    expect(audits[0]?.metadata).toMatchObject({
      services: { added: [ids.vpn], removed: [ids.mail] },
    });
  });

  it('rejects backdating beyond 30 days without a reason', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000);
    await expect(
      incidents.create(
        { title: 'Backdated incident', impact: 'DOWN', serviceIds: [ids.vpn], message: 'Stariji incident', startedAt: fortyDaysAgo.toISOString() },
        operator,
      ),
    ).rejects.toMatchObject({ status: 400, response: { code: 'INCIDENT_BACKDATE_REQUIRES_REASON' } });
  });

  it('allows backdating beyond 30 days with a reason and records it in audit', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000);
    const created = await incidents.create(
      { title: 'Backdated incident', impact: 'DOWN', serviceIds: [ids.vpn], message: 'Stariji incident', startedAt: fortyDaysAgo.toISOString(), startedAtReason: 'Outage started before monitoring detected it' },
      operator,
    );
    const audits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'status.incident.created' },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { metadata: true },
    });
    expect(audits[0]?.metadata).toMatchObject({
      backdated: true,
      backdatedDays: 40,
      backdatedReason: 'Outage started before monitoring detected it',
    });
  });

  it('allows backdating within 30 days without a reason', async () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000);
    const created = await incidents.create(
      { title: 'Recent backdate', impact: 'DOWN', serviceIds: [ids.vpn], message: 'Nedavni incident', startedAt: twentyDaysAgo.toISOString() },
      operator,
    );
    const audits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'status.incident.created' },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { metadata: true },
    });
    expect((audits[0]?.metadata as { backdated?: unknown })?.backdated).toBeUndefined();
  });
});
