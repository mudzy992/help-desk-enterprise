import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { notificationTypes, type NotificationType } from '../notifications/notifications.constants';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import type { PrivacyActor } from '../privacy/privacy-actor';
import { SettingsService } from '../settings/settings.service';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { mapTicketError } from '../tickets/map-ticket-error';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import type { AddIncidentUpdateDto, CreateIncidentDto, UpdateIncidentDto } from './status-page.dto';
import {
  isIncidentStatusTransitionAllowed,
  openIncidentStatuses,
  statusPageLimits,
  type IncidentStatus,
} from './status-page.model';

const openTicketStatuses = ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] as const;

type IncidentRow = {
  id: string;
  title: string;
  titleEn: string | null;
  impact: string;
  status: string;
  visibility: string;
  startedAt: Date;
  resolvedAt: Date | null;
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
  private readonly logger = new Logger(StatusIncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
  ) {}

  async create(input: CreateIncidentDto, actor: PrivacyActor, now: Date = new Date()): Promise<{ readonly id: string; readonly notified: number }> {
    const serviceIds = await this.assertServices(input.serviceIds);
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
      return created;
    });
    const notified =
      input.notifyOpenTicketHolders === true && visibility === 'ALL_USERS'
        ? await this.notifyStart(incident, serviceIds, actor.principal.subjectId)
        : 0;
    return { id: incident.id, notified };
  }

  async edit(id: string, input: UpdateIncidentDto, actor: PrivacyActor): Promise<void> {
    const current = await this.load(id);
    if (current.status === 'RESOLVED') {
      throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'A resolved incident can no longer be edited' });
    }
    const serviceIds = input.serviceIds === undefined ? undefined : await this.assertServices(input.serviceIds);
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
      await transaction.serviceIncident.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.titleEn === undefined ? {} : { titleEn: input.titleEn }),
          ...(input.impact === undefined ? {} : { impact: input.impact }),
          ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        },
      });
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
          ...(input.visibility === undefined ? {} : { visibility: { from: current.visibility, to: input.visibility } }),
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
    const resolving = input.status === 'RESOLVED';
    const incident = await this.prisma.$transaction(async (transaction) => {
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
        const links = await transaction.ticketIncidentLink.findMany({ where: { incidentId: id }, select: { ticketId: true } });
        for (const link of links) {
          await insertSystemTicketEvent(transaction as never, {
            ticketId: link.ticketId,
            action: ticketSystemEventActions.incidentResolved,
            actorUserId: actor.principal.subjectId,
            detail: eventDetail(current),
          });
        }
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
      return current;
    });
    if (!resolving || input.notifyOnResolve === false) return { notified: 0 };
    return { notified: await this.notifyResolved(incident, input.message, actor.principal.subjectId, now) };
  }

  /** How many people a resolution would notify - the preview before confirming (§8.3). */
  async resolvePreview(id: string): Promise<{ readonly subscribers: number; readonly requesters: number; readonly recipients: number; readonly linkedTickets: number }> {
    const incident = await this.load(id);
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
  async linkTicket(incidentId: string, ticketId: string, actor: PrivacyActor): Promise<{ readonly linked: boolean }> {
    const incident = await this.load(incidentId);
    if (incident.status === 'RESOLVED') {
      throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'A resolved incident cannot take new tickets' });
    }
    await this.assertStaffTicket(ticketId, actor);
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.ticketIncidentLink.findUnique({ where: { ticketId_incidentId: { ticketId, incidentId } } });
      if (existing !== null) return { linked: false };
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

  async unlinkTicket(incidentId: string, ticketId: string, actor: PrivacyActor): Promise<{ readonly unlinked: boolean }> {
    const incident = await this.load(incidentId);
    await this.assertStaffTicket(ticketId, actor);
    return this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.ticketIncidentLink.deleteMany({ where: { ticketId, incidentId } });
      if (removed.count === 0) return { unlinked: false };
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

  /** "Notify me when resolved" - only for incidents the viewer can see. */
  async subscribe(incidentId: string, userId: string, canSeeStaffOnly: boolean): Promise<{ readonly subscribed: true }> {
    const incident = await this.load(incidentId);
    if (incident.visibility === 'STAFF_ONLY' && !canSeeStaffOnly) throw notFound();
    if (incident.status === 'RESOLVED') {
      throw new ConflictException({ code: 'INCIDENT_RESOLVED', message: 'The incident is already resolved' });
    }
    await this.prisma.serviceIncidentSubscription.upsert({
      where: { incidentId_userId: { incidentId, userId } },
      create: { incidentId, userId },
      update: {},
    });
    return { subscribed: true };
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

  private async notifyStart(incident: IncidentRow, serviceIds: readonly string[], actorUserId: string): Promise<number> {
    const rows = await this.prisma.ticket.findMany({
      where: { serviceId: { in: [...serviceIds] }, status: { in: [...openTicketStatuses] }, requester: { isActive: true } },
      select: { requesterId: true },
      distinct: ['requesterId'],
      take: statusPageLimits.startNotifyMaxRecipients,
    });
    const recipients = rows.map((row) => row.requesterId).filter((userId) => userId !== actorUserId);
    return this.fanOut(recipients, notificationTypes.statusIncidentStarted, incident, incident.title, `status-incident-start:${incident.id}`);
  }

  private async notifyResolved(incident: IncidentRow, message: string, actorUserId: string, now: Date): Promise<number> {
    const [subscribers, requesters] = await Promise.all([
      this.pendingSubscriberIds(incident.id),
      incident.visibility === 'ALL_USERS' ? this.linkedRequesterIds(incident.id) : Promise.resolve([]),
    ]);
    const recipients = [...new Set([...subscribers, ...requesters])].filter((userId) => userId !== actorUserId);
    const body = `${incident.title} — ${truncate(message, 200)}`;
    const notified = await this.fanOut(recipients, notificationTypes.statusIncidentResolved, incident, body, `status-incident-resolved:${incident.id}`);
    await this.prisma.serviceIncidentSubscription
      .updateMany({ where: { incidentId: incident.id, notifiedAt: null }, data: { notifiedAt: now } })
      .catch((error: unknown) => this.logger.warn(`status_incident_subscriptions_mark_failed incident=${incident.id} reason=${String(error)}`));
    return notified;
  }

  private async fanOut(
    userIds: readonly string[],
    type: NotificationType,
    incident: IncidentRow,
    body: string,
    dedupePrefix: string,
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const policy = await loadNotificationPreferencePolicy(this.settings);
    let sent = 0;
    for (const userId of userIds) {
      try {
        const created = await persistInAppNotification(
          this.prisma,
          {
            userId,
            type,
            title: type === notificationTypes.statusIncidentStarted ? 'notifications.items.statusIncidentStarted' : 'notifications.items.statusIncidentResolved',
            body: truncate(body, 400),
            ticketId: null,
            payload: {
              ticketId: '',
              ticketNumber: '',
              event: type,
              messageId: dedupePrefix,
              actorUserId: null,
              confidential: false,
              incidentId: incident.id,
              impact: incident.impact,
            } as never,
            dedupeKey: `${dedupePrefix}:${userId}`,
          },
          policy,
        );
        if (created !== null) sent += 1;
      } catch (error) {
        this.logger.warn(`status_incident_notify_failed incident=${incident.id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return sent;
  }
}

/** `<incidentId>|<title>` - the client links the id and shows the title. */
function eventDetail(incident: Pick<IncidentRow, 'id' | 'title'>): string {
  return `${incident.id}|${truncate(incident.title, 150)}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });
}

export { openIncidentStatuses };
