import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { AuthorizationService } from '../authorization/authorization.service';
import type { PrivacyActor } from '../privacy/privacy-actor';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { mapTicketError } from '../tickets/map-ticket-error';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import type { AddIncidentUpdateDto, CreateIncidentDto, UpdateIncidentDto } from './status-page.dto';
import {
  statusIncidentResolutionDeliveryTopic,
  statusIncidentResolutionTicketEventTopic,
  statusIncidentStartDeliveryTopic,
} from './status-incident-start-delivery.constants';
import { withIncidentVisibility, type StatusViewer } from './status-page.service';
import {
  isIncidentStatusTransitionAllowed,
  openIncidentStatuses,
  type IncidentStatus,
} from './status-page.model';

type IncidentRow = {
  id: string;
  title: string;
  titleEn: string | null;
  impact: string;
  status: string;
  visibility: string;
  startedAt: Date;
  resolvedAt: Date | null;
  updatedAt: Date;
};

const incidentSelect = {
  id: true,
  title: true,
  titleEn: true,
  impact: true,
  status: true,
  visibility: true,
  startedAt: true,
  resolvedAt: true,
  updatedAt: true,
} as const;

export type IncidentNotifyResult = { readonly notified: number };

/**
 * Paket 2.7 (§8.3): the write side of incidents. Every change is audited
 * (ids, impact, status and counts only - titles and messages are shown on
 * the page itself, not copied into the audit chain). Notifications are
 * in-app only (no mass e-mail, §8.3) and honour personal preferences.
 */
@Injectable()
export class StatusIncidentsService {
  private readonly outbox: TransactionalOutboxService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly authorization: AuthorizationService,
  ) {
    this.outbox = new TransactionalOutboxService(prisma);
  }

  async create(input: CreateIncidentDto, actor: PrivacyActor, now: Date = new Date()): Promise<{ readonly id: string; readonly notified: number }> {
    const serviceIds = await this.assertServices(input.serviceIds);
    await this.requireManageServices(serviceIds, actor);
    const startedAt = input.startedAt === undefined ? now : new Date(input.startedAt);
    if (startedAt.getTime() > now.getTime() + 60_000) {
      throw new BadRequestException({ code: 'INCIDENT_START_IN_FUTURE', message: 'An incident cannot start in the future' });
    }
    const ticketIds = [...new Set(input.ticketIds ?? [])];
    for (const ticketId of ticketIds) await this.assertStaffTicket(ticketId, actor);
    const visibility = input.visibility ?? 'ALL_USERS';
    const incident = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.serviceIncident.create({
        data: {
          title: input.title,
          titleEn: input.titleEn ?? null,
          impact: input.impact,
          status: 'INVESTIGATING',
          visibility,
          startedAt,
          createdByUserId: actor.principal.subjectId,
          services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
          updates: { create: { status: 'INVESTIGATING', message: input.message, authorUserId: actor.principal.subjectId } },
        },
        select: incidentSelect,
      });
      for (const ticketId of ticketIds) {
        await transaction.ticketIncidentLink.create({ data: { ticketId, incidentId: created.id, linkedByUserId: actor.principal.subjectId } });
        await insertSystemTicketEvent(transaction as never, {
          ticketId,
          action: ticketSystemEventActions.incidentLinked,
          actorUserId: actor.principal.subjectId,
          detail: eventDetail(created),
        });
      }
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.statusIncidentCreated,
        entityType: auditLogEntityTypes.statusIncident,
        entityId: created.id,
        metadata: { impact: created.impact, visibility, serviceIds, linkedTickets: ticketIds.length, notify: input.notifyOpenTicketHolders === true },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
        organizationalUnitId: null,
      });
      if (input.notifyOpenTicketHolders === true && visibility === 'ALL_USERS') {
        await this.outbox.enqueue(transaction as never, {
          topic: statusIncidentStartDeliveryTopic,
          dedupeKey: created.id,
          payload: { incidentId: created.id, actorUserId: actor.principal.subjectId, serviceIds },
          maxAttempts: 25,
        });
      }
      return created;
    });
    // Delivery is durable and asynchronous; `notified` now reports synchronous writes only.
    return { id: incident.id, notified: 0 };
  }

  async edit(id: string, input: UpdateIncidentDto, actor: PrivacyActor, expectedRevision?: string): Promise<void> {
    const current = await this.load(id);
    const currentServiceIds = await this.incidentServiceIds(id);
    await this.requireManageServices(currentServiceIds, actor, true);
    if (current.status === 'RESOLVED') {
      throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'A resolved incident can no longer be edited' });
    }
    const serviceIds = input.serviceIds === undefined ? undefined : await this.assertServices(input.serviceIds);
    if (serviceIds !== undefined) await this.requireManageServices(serviceIds, actor);
    const changed = Object.entries({
      title: input.title,
      titleEn: input.titleEn,
      impact: input.impact,
      visibility: input.visibility,
      services: serviceIds,
    })
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (changed.length === 0) return;
    await this.prisma.$transaction(async (transaction) => {
      await lockStatusIncident(transaction as never, id);
      const locked = await transaction.serviceIncident.findUnique({ where: { id }, select: { visibility: true, status: true, updatedAt: true } });
      if (locked === null) throw notFound();
      if (locked.status === 'RESOLVED') {
        throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'A resolved incident can no longer be edited' });
      }
      assertIncidentRevision(locked.updatedAt, expectedRevision ?? current.updatedAt.toISOString());
      const edited = await transaction.serviceIncident.updateMany({
        where: { id, status: { not: 'RESOLVED' }, updatedAt: locked.updatedAt },
        data: {
          updatedAt: new Date(),
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.titleEn === undefined ? {} : { titleEn: input.titleEn }),
          ...(input.impact === undefined ? {} : { impact: input.impact }),
          ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        },
      });
      if (edited.count === 0) throw incidentChanged();
      const revokedSubscriptions =
        locked.visibility === 'ALL_USERS' && input.visibility === 'STAFF_ONLY'
          ? await transaction.serviceIncidentSubscription.deleteMany({ where: { incidentId: id } })
          : { count: 0 };
      if (serviceIds !== undefined) {
        await transaction.serviceIncidentService.deleteMany({ where: { incidentId: id, serviceId: { notIn: serviceIds } } });
        await transaction.serviceIncidentService.createMany({
          data: serviceIds.map((serviceId) => ({ incidentId: id, serviceId })),
          skipDuplicates: true,
        });
      }
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.statusIncidentEdited,
        entityType: auditLogEntityTypes.statusIncident,
        entityId: id,
        metadata: {
          changed,
          ...(input.impact === undefined ? {} : { impact: { from: current.impact, to: input.impact } }),
          ...(input.visibility === undefined ? {} : { visibility: { from: locked.visibility, to: input.visibility } }),
          ...(revokedSubscriptions.count === 0 ? {} : { revokedSubscriptions: revokedSubscriptions.count }),
          ...(serviceIds === undefined ? {} : { serviceIds }),
        },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
        organizationalUnitId: null,
      });
    });
  }

  /** A timeline entry; RESOLVED closes the incident and notifies (§8.3). */
  async addUpdate(id: string, input: AddIncidentUpdateDto, actor: PrivacyActor, now: Date = new Date()): Promise<IncidentNotifyResult> {
    await this.requireManageServices(await this.incidentServiceIds(id), actor, true);
    const resolving = input.status === 'RESOLVED';
    await this.prisma.$transaction(async (transaction) => {
      await lockStatusIncident(transaction as never, id);
      const current = (await transaction.serviceIncident.findUnique({ where: { id }, select: incidentSelect })) as IncidentRow | null;
      if (current === null) throw notFound();
      if (!isIncidentStatusTransitionAllowed(current.status as IncidentStatus, input.status)) {
        throw new ConflictException({ code: 'INCIDENT_STATUS_TRANSITION', message: `Cannot move from ${current.status} to ${input.status}` });
      }
      // Guarded write: two operators resolving at once produce one resolution.
      const moved = await transaction.serviceIncident.updateMany({
        where: { id, status: current.status },
        data: { status: input.status, ...(resolving ? { resolvedAt: now } : {}) },
      });
      if (moved.count === 0) {
        throw new ConflictException({ code: 'INCIDENT_CHANGED', message: 'The incident was changed meanwhile; reload and try again' });
      }
      await transaction.serviceIncidentUpdate.create({
        data: { incidentId: id, status: input.status, message: input.message, authorUserId: actor.principal.subjectId, createdAt: now },
      });
      if (resolving) {
        await this.outbox.enqueue(transaction as never, {
          topic: statusIncidentResolutionTicketEventTopic,
          dedupeKey: `resolution-events:${current.id}`,
          payload: { incidentId: current.id, actorUserId: actor.principal.subjectId },
          maxAttempts: 25,
        });
      }
      await recordAuditEntry(transaction as never, {
        action: resolving ? auditLogActions.statusIncidentResolved : auditLogActions.statusIncidentUpdatePosted,
        entityType: auditLogEntityTypes.statusIncident,
        entityId: id,
        metadata: {
          from: current.status,
          to: input.status,
          ...(resolving ? { durationMinutes: Math.round((now.getTime() - current.startedAt.getTime()) / 60_000) } : {}),
        },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
        organizationalUnitId: null,
      });
      if (resolving && input.notifyOnResolve !== false) {
        await this.outbox.enqueue(transaction as never, {
          topic: statusIncidentResolutionDeliveryTopic,
          dedupeKey: `resolution:${current.id}`,
          payload: {
            incidentId: current.id,
            actorUserId: actor.principal.subjectId,
            message: truncate(input.message, 200),
            resolvedAt: now.toISOString(),
          },
          maxAttempts: 25,
        });
      }
    });
    return { notified: 0 };
  }

  /** How many people a resolution would notify - the preview before confirming (§8.3). */
  async resolvePreview(id: string, actor: PrivacyActor): Promise<{ readonly subscribers: number; readonly requesters: number; readonly recipients: number; readonly linkedTickets: number }> {
    const incident = await this.load(id);
    await this.requireManageServices(await this.incidentServiceIds(id), actor, true);
    const [subscribers, requesters, linkedTickets] = await Promise.all([
      this.pendingSubscriberIds(id),
      incident.visibility === 'ALL_USERS' ? this.linkedRequesterIds(id) : Promise.resolve([]),
      this.prisma.ticketIncidentLink.count({ where: { incidentId: id } }),
    ]);
    return {
      subscribers: subscribers.length,
      requesters: requesters.length,
      recipients: new Set([...subscribers, ...requesters]).size,
      linkedTickets,
    };
  }

  /** Staff on a ticket they can work on; AGENT needs no extra permission (§9). */
  async linkTicket(incidentId: string, ticketId: string, actor: PrivacyActor, expectedRevision?: string): Promise<{ readonly linked: boolean }> {
    // A cross-domain link requires authority over both resources. Check the
    // incident first and conceal foreign incident IDs before loading content.
    await this.requireManageServices(await this.incidentServiceIds(incidentId), actor, true);
    const incident = await this.load(incidentId);
    if (incident.status === 'RESOLVED') {
      throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'A resolved incident cannot take new tickets' });
    }
    await this.assertStaffTicket(ticketId, actor);
    return this.prisma.$transaction(async (transaction) => {
      await lockStatusIncident(transaction as never, incidentId);
      const locked = await transaction.serviceIncident.findUnique({ where: { id: incidentId }, select: { status: true, updatedAt: true } });
      if (locked === null) throw notFound();
      if (locked.status === 'RESOLVED') throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'A resolved incident cannot take new tickets' });
      assertIncidentRevision(locked.updatedAt, expectedRevision ?? incident.updatedAt.toISOString());
      const existing = await transaction.ticketIncidentLink.findUnique({ where: { ticketId_incidentId: { ticketId, incidentId } } });
      if (existing !== null) return { linked: false };
      const claimed = await transaction.serviceIncident.updateMany({
        where: { id: incidentId, status: { not: 'RESOLVED' }, updatedAt: locked.updatedAt },
        data: { updatedAt: new Date() },
      });
      if (claimed.count === 0) throw incidentChanged();
      await transaction.ticketIncidentLink.create({ data: { ticketId, incidentId, linkedByUserId: actor.principal.subjectId } });
      await insertSystemTicketEvent(transaction as never, {
        ticketId,
        action: ticketSystemEventActions.incidentLinked,
        actorUserId: actor.principal.subjectId,
        detail: eventDetail(incident),
      });
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.statusIncidentTicketLinked,
        entityType: auditLogEntityTypes.statusIncident,
        entityId: incidentId,
        metadata: { ticketId },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
        organizationalUnitId: null,
      });
      return { linked: true };
    });
  }

  async unlinkTicket(incidentId: string, ticketId: string, actor: PrivacyActor, expectedRevision?: string): Promise<{ readonly unlinked: boolean }> {
    await this.requireManageServices(await this.incidentServiceIds(incidentId), actor, true);
    const incident = await this.load(incidentId);
    await this.assertStaffTicket(ticketId, actor);
    return this.prisma.$transaction(async (transaction) => {
      await lockStatusIncident(transaction as never, incidentId);
      const locked = await transaction.serviceIncident.findUnique({ where: { id: incidentId }, select: { updatedAt: true } });
      if (locked === null) throw notFound();
      assertIncidentRevision(locked.updatedAt, expectedRevision ?? incident.updatedAt.toISOString());
      const removed = await transaction.ticketIncidentLink.deleteMany({ where: { ticketId, incidentId } });
      if (removed.count === 0) return { unlinked: false };
      const claimed = await transaction.serviceIncident.updateMany({
        where: { id: incidentId, updatedAt: locked.updatedAt },
        data: { updatedAt: new Date() },
      });
      if (claimed.count === 0) throw incidentChanged();
      await insertSystemTicketEvent(transaction as never, {
        ticketId,
        action: ticketSystemEventActions.incidentUnlinked,
        actorUserId: actor.principal.subjectId,
        detail: eventDetail(incident),
      });
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.statusIncidentTicketUnlinked,
        entityType: auditLogEntityTypes.statusIncident,
        entityId: incidentId,
        metadata: { ticketId },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
        organizationalUnitId: null,
      });
      return { unlinked: true };
    });
  }

  /** "Notify me when resolved" - serialized with visibility transitions. */
  async subscribe(incidentId: string, viewer: StatusViewer & { readonly userId: string }): Promise<{ readonly subscribed: true }> {
    return this.prisma.$transaction(async (transaction) => {
      await lockStatusIncident(transaction as never, incidentId);
      const incident = await transaction.serviceIncident.findFirst({
        where: withIncidentVisibility({ id: incidentId }, viewer) as never,
        select: { status: true },
      });
      if (incident === null) throw notFound();
      if (incident.status === 'RESOLVED') {
        throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'The incident is already resolved' });
      }
      await transaction.serviceIncidentSubscription.upsert({
        where: { incidentId_userId: { incidentId, userId: viewer.userId } },
        create: { incidentId, userId: viewer.userId },
        update: {},
      });
      return { subscribed: true };
    });
  }

  async unsubscribe(incidentId: string, userId: string): Promise<{ readonly subscribed: false }> {
    await this.prisma.serviceIncidentSubscription.deleteMany({ where: { incidentId, userId } });
    return { subscribed: false };
  }

  // ------------------------------------------------------------------ shared

  private async load(id: string): Promise<IncidentRow> {
    const row = (await this.prisma.serviceIncident.findUnique({ where: { id }, select: incidentSelect })) as IncidentRow | null;
    if (row === null) throw notFound();
    return row;
  }

  private async incidentServiceIds(incidentId: string): Promise<string[]> {
    const rows = await this.prisma.serviceIncidentService.findMany({ where: { incidentId }, select: { serviceId: true } });
    if (rows.length === 0) throw notFound();
    return rows.map((row) => row.serviceId);
  }

  private async requireManageServices(serviceIds: readonly string[], actor: PrivacyActor, concealIncident = false): Promise<void> {
    if (serviceIds.length === 0) {
      if (concealIncident) throw notFound();
      throw new ForbiddenException({ code: 'INCIDENT_MANAGE_FORBIDDEN', message: 'The incident is outside the allowed service scope' });
    }
    const decisions = await Promise.all(
      [...new Set(serviceIds)].map((serviceId) =>
        this.authorization.authorizeResource({
          principal: actor.principal,
          permissionKey: permissionKeys.statusIncidentsManage,
          ownerUserId: null,
          organizationalUnitId: null,
          serviceId,
          allowOwner: false,
        }),
      ),
    );
    if (decisions.some((decision) => !decision.allowed)) {
      if (concealIncident) throw notFound();
      throw new ForbiddenException({ code: 'INCIDENT_MANAGE_FORBIDDEN', message: 'The incident is outside the allowed service scope' });
    }
  }

  private async assertServices(ids: readonly string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = await this.prisma.service.findMany({ where: { id: { in: unique } }, select: { id: true } });
    if (found.length !== unique.length) {
      throw new BadRequestException({ code: 'INCIDENT_SERVICE_NOT_FOUND', message: 'One or more services do not exist' });
    }
    return unique;
  }

  private async assertStaffTicket(ticketId: string, actor: PrivacyActor): Promise<void> {
    let visibility: string;
    try {
      const { access } = await loadAccessibleTicket(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind({ actorUserId: actor.principal.subjectId }),
      );
      visibility = access.visibility;
    } catch (error) {
      throw mapTicketError(error);
    }
    if (visibility !== 'staff') {
      throw new ForbiddenException({ code: 'INCIDENT_TICKET_FORBIDDEN', message: 'Only staff on the ticket can link it to an incident' });
    }
  }

  private async pendingSubscriberIds(incidentId: string): Promise<string[]> {
    const rows = await this.prisma.serviceIncidentSubscription.findMany({
      where: { incidentId, notifiedAt: null, user: { isActive: true } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  private async linkedRequesterIds(incidentId: string): Promise<string[]> {
    const rows = await this.prisma.ticketIncidentLink.findMany({
      where: { incidentId, ticket: { requester: { isActive: true } } },
      select: { ticket: { select: { requesterId: true } } },
    });
    return [...new Set(rows.map((row) => row.ticket.requesterId))];
  }


}

async function lockStatusIncident(transaction: { readonly $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }, incidentId: string): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`status-incident:${incidentId}`}, 0))`;
}

/** `<incidentId>|<title>` - the client links the id and shows the title. */
function eventDetail(incident: Pick<IncidentRow, 'id' | 'title'>): string {
  return `${incident.id}|${truncate(incident.title, 150)}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function assertIncidentRevision(actual: Date, expected: string): void {
  if (actual.toISOString() !== expected) throw incidentChanged();
}

function incidentChanged(): ConflictException {
  return new ConflictException({ code: 'INCIDENT_CHANGED', message: 'The incident was changed meanwhile; reload and try again' });
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });
}

export { openIncidentStatuses };
