import { Injectable } from '@nestjs/common';
import { TransactionalOutboxService, type OutboxDelivery } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationTypes } from '../notifications/notifications.constants';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import { SettingsService } from '../settings/settings.service';
import {
  statusIncidentResolutionDeliveryTopic,
  statusIncidentStartDeliveryMaxRunsPerSweep,
  statusIncidentStartDeliveryPageSize,
  statusIncidentStartDeliveryTopic,
} from './status-incident-start-delivery.constants';

const openTicketStatuses = ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] as const;

type StartPayload = { readonly incidentId: string; readonly actorUserId: string; readonly serviceIds: readonly string[] };
type ResolutionPayload = { readonly incidentId: string; readonly actorUserId: string; readonly message: string; readonly resolvedAt: Date };

@Injectable()
export class StatusIncidentStartDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
    private readonly settings: SettingsService,
  ) {}

  async runSweep(): Promise<number> {
    let completed = 0;
    for (let index = 0; index < statusIncidentStartDeliveryMaxRunsPerSweep; index += 1) {
      const start = await this.outbox.dispatchOne(statusIncidentStartDeliveryTopic, (delivery) => this.deliver(delivery));
      const resolution = await this.outbox.dispatchOne(statusIncidentResolutionDeliveryTopic, (delivery) => this.deliverResolution(delivery));
      if (start === 'succeeded') completed += 1;
      if (resolution === 'succeeded') completed += 1;
      if (start === 'idle' && resolution === 'idle') break;
    }
    return completed;
  }

  async deliver(delivery: OutboxDelivery): Promise<void> {
    const payload = parsePayload(delivery.payload);
    const incident = await this.prisma.serviceIncident.findUnique({
      where: { id: payload.incidentId },
      select: { id: true, title: true, impact: true, visibility: true },
    });
    // A later visibility restriction cancels public delivery without disclosing content.
    if (incident === null || incident.visibility !== 'ALL_USERS') return;
    const policy = await loadNotificationPreferencePolicy(this.settings);
    let cursor: string | null = null;
    for (;;) {
      const users: Array<{ id: string }> = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { ...(cursor === null ? {} : { gt: cursor }), not: payload.actorUserId },
          requestedTickets: {
            some: { serviceId: { in: [...payload.serviceIds] }, status: { in: [...openTicketStatuses] } },
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: statusIncidentStartDeliveryPageSize,
      });
      if (users.length === 0) return;
      for (const user of users) {
        await persistInAppNotification(
          this.prisma,
          {
            userId: user.id,
            type: notificationTypes.statusIncidentStarted,
            title: 'notifications.items.statusIncidentStarted',
            body: truncate(incident.title, 400),
            ticketId: null,
            payload: {
              ticketId: '', ticketNumber: '', event: notificationTypes.statusIncidentStarted,
              messageId: `status-incident-start:${incident.id}`, actorUserId: null,
              confidential: false, incidentId: incident.id, impact: incident.impact,
            } as never,
            dedupeKey: `status-incident-start:${incident.id}:${user.id}`,
          },
          policy,
        );
      }
      cursor = users[users.length - 1].id;
      if (users.length < statusIncidentStartDeliveryPageSize) return;
    }
  }

  async deliverResolution(delivery: OutboxDelivery): Promise<void> {
    const payload = parseResolutionPayload(delivery.payload);
    const incident = await this.prisma.serviceIncident.findUnique({
      where: { id: payload.incidentId },
      select: { id: true, title: true, impact: true, visibility: true, status: true },
    });
    if (incident === null || incident.status !== 'RESOLVED') return;
    const policy = await loadNotificationPreferencePolicy(this.settings);
    const body = `${incident.title} — ${truncate(payload.message, 200)}`;
    let subscriberCursor: string | null = null;
    for (;;) {
      const subscriptions: Array<{ userId: string }> = await this.prisma.serviceIncidentSubscription.findMany({
        where: {
          incidentId: incident.id,
          notifiedAt: null,
          userId: subscriberCursor === null ? undefined : { gt: subscriberCursor },
          user: { isActive: true },
        },
        select: { userId: true },
        orderBy: { userId: 'asc' },
        take: statusIncidentStartDeliveryPageSize,
      });
      if (subscriptions.length === 0) break;
      for (const subscription of subscriptions) {
        if (subscription.userId !== payload.actorUserId) {
          await this.persistResolution(incident, subscription.userId, body, policy);
        }
        await this.prisma.serviceIncidentSubscription.updateMany({
          where: { incidentId: incident.id, userId: subscription.userId, notifiedAt: null },
          data: { notifiedAt: payload.resolvedAt },
        });
      }
      subscriberCursor = subscriptions[subscriptions.length - 1].userId;
      if (subscriptions.length < statusIncidentStartDeliveryPageSize) break;
    }
    if (incident.visibility !== 'ALL_USERS') return;
    let requesterCursor: string | null = null;
    for (;;) {
      const requesters: Array<{ id: string }> = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { ...(requesterCursor === null ? {} : { gt: requesterCursor }), not: payload.actorUserId },
          requestedTickets: { some: { incidentLinks: { some: { incidentId: incident.id } } } },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: statusIncidentStartDeliveryPageSize,
      });
      if (requesters.length === 0) return;
      for (const requester of requesters) await this.persistResolution(incident, requester.id, body, policy);
      requesterCursor = requesters[requesters.length - 1].id;
      if (requesters.length < statusIncidentStartDeliveryPageSize) return;
    }
  }

  private async persistResolution(
    incident: { readonly id: string; readonly impact: string },
    userId: string,
    body: string,
    policy: Awaited<ReturnType<typeof loadNotificationPreferencePolicy>>,
  ): Promise<void> {
    await persistInAppNotification(
      this.prisma,
      {
        userId,
        type: notificationTypes.statusIncidentResolved,
        title: 'notifications.items.statusIncidentResolved',
        body: truncate(body, 400),
        ticketId: null,
        payload: {
          ticketId: '', ticketNumber: '', event: notificationTypes.statusIncidentResolved,
          messageId: `status-incident-resolved:${incident.id}`, actorUserId: null,
          confidential: false, incidentId: incident.id, impact: incident.impact,
        } as never,
        dedupeKey: `status-incident-resolved:${incident.id}:${userId}`,
      },
      policy,
    );
  }
}

function parsePayload(value: unknown): StartPayload {
  if (typeof value !== 'object' || value === null) throw new Error('STATUS_INCIDENT_START_PAYLOAD_INVALID');
  const row = value as Record<string, unknown>;
  if (typeof row.incidentId !== 'string' || typeof row.actorUserId !== 'string' || !Array.isArray(row.serviceIds) || row.serviceIds.some((id) => typeof id !== 'string')) {
    throw new Error('STATUS_INCIDENT_START_PAYLOAD_INVALID');
  }
  return { incidentId: row.incidentId, actorUserId: row.actorUserId, serviceIds: row.serviceIds as string[] };
}

function parseResolutionPayload(value: unknown): ResolutionPayload {
  if (typeof value !== 'object' || value === null) throw new Error('STATUS_INCIDENT_RESOLUTION_PAYLOAD_INVALID');
  const row = value as Record<string, unknown>;
  const resolvedAt = typeof row.resolvedAt === 'string' ? new Date(row.resolvedAt) : new Date(Number.NaN);
  if (typeof row.incidentId !== 'string' || typeof row.actorUserId !== 'string' || typeof row.message !== 'string' || Number.isNaN(resolvedAt.getTime())) {
    throw new Error('STATUS_INCIDENT_RESOLUTION_PAYLOAD_INVALID');
  }
  return { incidentId: row.incidentId, actorUserId: row.actorUserId, message: row.message, resolvedAt };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
