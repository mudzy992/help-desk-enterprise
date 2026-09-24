import {
  loadNotificationAudience,
  visibleNotificationWhere,
} from '../notifications/notification-audience';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { SettingsService } from '../settings/settings.service';
import {
  edgeExtensionDenyReasons,
  type EdgeExtensionReceiptKind,
} from './edge-extension.constants';
import { EdgeExtensionError } from './edge-extension.error';
import { evaluateEdgeExtensionAccess } from './evaluate-edge-extension-access';
import { executeEdgeExtensionOperation } from './execute-edge-extension-operation';
import { loadEdgeExtensionConfiguration } from './load-edge-extension-configuration';
import type {
  EdgeExtensionBootstrapResponse,
  EdgeExtensionReceiptResponse,
} from './edge-extension.types';

@Injectable()
export class EdgeExtensionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  bootstrap(
    principal: AuthorizationPrincipal,
    extensionVersion: string,
  ): Promise<EdgeExtensionBootstrapResponse> {
    return executeEdgeExtensionOperation(() =>
      this.buildBootstrap(principal, extensionVersion),
    );
  }

  recordReceipt(
    principal: AuthorizationPrincipal,
    input: {
      readonly notificationId: string;
      readonly kind: EdgeExtensionReceiptKind;
      readonly eventId?: string;
    },
  ): Promise<EdgeExtensionReceiptResponse> {
    return executeEdgeExtensionOperation(() =>
      this.writeReceipt(principal, input),
    );
  }

  private async buildBootstrap(
    principal: AuthorizationPrincipal,
    extensionVersion: string,
  ): Promise<EdgeExtensionBootstrapResponse> {
    const configuration = await loadEdgeExtensionConfiguration(
      this.settingsService,
    );
    const reason = evaluateEdgeExtensionAccess({
      configuration,
      email: principal.email,
      extensionVersion,
    });
    return {
      allowed: reason === edgeExtensionDenyReasons.ok,
      reason,
      deskPublicUrl: readDeskPublicUrl(),
      wsEnabled: configuration.wsEnabled,
      reconnectMaxBackoffSeconds: configuration.reconnectMaxBackoffSeconds,
      pollingFallbackEnabled: configuration.pollingFallbackEnabled,
      pollingIntervalSeconds: configuration.pollingIntervalSeconds,
      redactedPreviews: configuration.redactedPreviews,
      receiptsEnabled: configuration.receiptsEnabled,
      dedupEnabled: configuration.dedupEnabled,
      minClientVersion: configuration.minClientVersion,
      allowedEmailDomain: configuration.allowedEmailDomain,
      subjectId: principal.subjectId,
      chatEnabled: configuration.chatEnabled,
      chatMaxMessagesPerTicket: configuration.chatMaxMessagesPerTicket,
      attachmentsEnabled: configuration.attachmentsEnabled,
      remoteEnabled: configuration.remoteEnabled,
      remoteRateLimitMinutesPerTicket:
        configuration.remoteRateLimitMinutesPerTicket,
      requireUserClickToOpenQuickAssist:
        configuration.requireUserClickToOpenQuickAssist,
      auditAcknowledge: configuration.auditAcknowledge,
    };
  }

  private async writeReceipt(
    principal: AuthorizationPrincipal,
    input: {
      readonly notificationId: string;
      readonly kind: EdgeExtensionReceiptKind;
      readonly eventId?: string;
    },
  ): Promise<EdgeExtensionReceiptResponse> {
    const configuration = await loadEdgeExtensionConfiguration(
      this.settingsService,
    );
    if (!configuration.receiptsEnabled) {
      throw new EdgeExtensionError('RECEIPTS_DISABLED');
    }
    // Option A: a group notification is delivered to members too, so it is theirs to
    // acknowledge (same audience rule as the inbox).
    const memberships = await loadNotificationAudience(
      this.prisma,
      principal.subjectId,
    );
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: input.notificationId,
        ...visibleNotificationWhere(principal.subjectId, memberships),
      },
      select: { id: true },
    });
    if (notification === null) {
      throw new EdgeExtensionError('NOT_FOUND');
    }
    const eventId = input.eventId?.trim() || notification.id;
    const existing = await this.prisma.auditLog.findFirst({
      where: {
        action: auditLogActions.notificationReceipt,
        entityType: auditLogEntityTypes.notification,
        entityId: notification.id,
        actorUserId: principal.subjectId,
        metadata: { path: ['kind'], equals: input.kind },
      },
      select: { id: true },
    });
    if (existing !== null) {
      return {
        accepted: true,
        duplicate: true,
        kind: input.kind,
        notificationId: notification.id,
        eventId,
      };
    }
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.notificationReceipt,
      entityType: auditLogEntityTypes.notification,
      entityId: notification.id,
      actorUserId: principal.subjectId,
      metadata: { kind: input.kind, eventId },
    });
    return {
      accepted: true,
      duplicate: false,
      kind: input.kind,
      notificationId: notification.id,
      eventId,
    };
  }
}

function readDeskPublicUrl(): string {
  const value = process.env.APP_PUBLIC_URL;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '';
  }
  return value.replace(/\/$/, '');
}
