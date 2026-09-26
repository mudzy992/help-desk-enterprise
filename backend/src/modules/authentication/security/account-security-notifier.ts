import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { persistInAppNotification } from '../../notifications/fan-out/persist-in-app-notification';
import { notificationTitleKeys, type NotificationType } from '../../notifications/notifications.constants';

/**
 * Paket 2.1 (M8): audit + owner notification for account security events.
 * Never includes a code, secret or password. Failures are logged, never
 * thrown — a missing notification must not block a sign-in.
 */
@Injectable()
export class AccountSecurityNotifier {
  private readonly logger = new Logger(AccountSecurityNotifier.name);

  constructor(private readonly prisma: PrismaService) {}

  async audit(action: string, userId: string, actorUserId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
    try {
      await recordAuditEntry(this.prisma, {
        action,
        entityType: auditLogEntityTypes.user,
        entityId: userId,
        actorUserId,
        metadata: metadata as never,
      });
    } catch (error) {
      this.logger.warn(`audit write failed for ${action}: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }

  async notify(userId: string, type: NotificationType, body: string | null, dedupeKey: string): Promise<void> {
    try {
      await persistInAppNotification(this.prisma, {
        userId,
        type,
        title: notificationTitleKeys[type],
        body,
        ticketId: null,
        payload: {
          ticketId: '',
          ticketNumber: '',
          event: type,
          messageId: dedupeKey,
          actorUserId: null,
          confidential: false,
        } as never,
        dedupeKey,
      });
    } catch (error) {
      this.logger.warn(`security notification failed (${type}): ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}
