import { Injectable } from '@nestjs/common';
import { TransactionalOutboxService, type OutboxDelivery } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationTypes } from '../notifications/notifications.constants';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import { SettingsService } from '../settings/settings.service';
import {
  statusIncidentStartDeliveryMaxRunsPerSweep,
  statusIncidentStartDeliveryPageSize,
  statusIncidentStartDeliveryTopic,
} from './status-incident-start-delivery.constants';

const openTicketStatuses = ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] as const;

type StartPayload = { readonly incidentId: string; readonly actorUserId: string; readonly serviceIds: readonly string[] };

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
      const result = await this.outbox.dispatchOne(statusIncidentStartDeliveryTopic, (delivery) => this.deliver(delivery));
      if (result === 'idle') break;
      if (result === 'succeeded') completed += 1;
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
}

function parsePayload(value: unknown): StartPayload {
  if (typeof value !== 'object' || value === null) throw new Error('STATUS_INCIDENT_START_PAYLOAD_INVALID');
  const row = value as Record<string, unknown>;
  if (typeof row.incidentId !== 'string' || typeof row.actorUserId !== 'string' || !Array.isArray(row.serviceIds) || row.serviceIds.some((id) => typeof id !== 'string')) {
    throw new Error('STATUS_INCIDENT_START_PAYLOAD_INVALID');
  }
  return { incidentId: row.incidentId, actorUserId: row.actorUserId, serviceIds: row.serviceIds as string[] };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
