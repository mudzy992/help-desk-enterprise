import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrivilegedAuditService } from '../../../common/privileged-audit/privileged-audit.service';
import { auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { persistInAppNotification } from '../../notifications/fan-out/persist-in-app-notification';
import { notificationTitleKeys, type NotificationType } from '../../notifications/notifications.constants';

/**
 * Paket 2.1 (M8): audit + owner notification for account security events.
 * Never includes a code, secret or password. A missing notification must not
 * block a sign-in, and since W2.24 (`BA-security-03`) a failed audit write is no
 * longer swallowed either: the event becomes a durable intent that a replay
 * delivers, and exactly one entry exists afterwards.
 */
@Injectable()
export class AccountSecurityNotifier {
  private readonly logger = new Logger(AccountSecurityNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly privilegedAudit: PrivilegedAuditService,
  ) {}

  async audit(action: string, userId: string, actorUserId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
    const outcome = await this.privilegedAudit.record({
      action,
      entityType: auditLogEntityTypes.user,
      entityId: userId,
      actorUserId,
      metadata: metadata as never,
    });
    if (outcome === 'pending') {
      this.logger.warn(`audit write pending for ${action}: stored as a durable intent`);
    } else if (outcome === 'unavailable') {
      this.logger.error(`audit write lost for ${action}: the intent itself could not be stored`);
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
