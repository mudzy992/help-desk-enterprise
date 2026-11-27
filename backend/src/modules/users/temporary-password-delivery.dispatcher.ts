import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
// W2.26: value imports on purpose — an `import type` erases the decorator metadata
// and Nest would inject `undefined` while the module still compiles (W2.10b).
import { HibpPasswordChecker } from '../authentication/security/hibp-password-checker';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsService } from '../settings/settings.service';
import { prepareTemporaryPassword } from './issue-temporary-password-for-user';
import { sendTemporaryPasswordEmail } from './send-temporary-password-email';
import {
  readTemporaryPasswordDeliveryPayload,
  temporaryPasswordDeliveryTopic,
} from './temporary-password-delivery.outbox';

const dispatchIntervalMs = 2_000;
const dispatchBatchSize = 10;

/**
 * W2.26 (`BA-users-02`): delivers the temporary password for accounts whose channel
 * is e-mail, out of the durable intent the create transaction committed.
 *
 *   commit (user + role + audit + intent) → claim → issue credential → mail → SUCCEEDED
 *                                                   ↘ mail fails → retry (≤ 8, new credential)
 *                                                   ↘ dead letter → warning; a reset is the way out
 *
 * The credential is generated **inside** the delivery, so a retry rotates it: an
 * attempt that failed never left a password behind that a later attempt would keep
 * valid. If the account was already provisioned in the meantime (an admin reset),
 * the delivery steps aside instead of overwriting a password somebody already holds.
 */
@Injectable()
export class TemporaryPasswordDeliveryDispatcher
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TemporaryPasswordDeliveryDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(
    private readonly outbox: TransactionalOutboxService,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly mailTransport: SmtpMailTransport,
    @Optional() private readonly hibpChecker?: HibpPasswordChecker,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(`temporary_password_delivery_drain_failed reason=${describeError(error)}`);
      });
    }, dispatchIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  /** Delivers pending intents; tests call it directly instead of waiting for the timer. */
  async drain(limit = dispatchBatchSize): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let delivered = 0;
    try {
      for (let index = 0; index < Math.max(1, limit); index += 1) {
        const result = await this.outbox.dispatchOne(
          temporaryPasswordDeliveryTopic,
          async (delivery) => {
            const intent = readTemporaryPasswordDeliveryPayload(delivery.payload);
            const sent = await this.deliver(intent);
            if (sent) delivered += 1;
          },
        );
        if (result === 'idle') break;
        if (result === 'dead-letter') {
          this.logger.warn(
            `temporary_password_delivery_dead_letter topic=${temporaryPasswordDeliveryTopic} recovery=admin_reset`,
          );
        }
      }
      return delivered;
    } finally {
      this.draining = false;
    }
  }

  private async deliver(intent: {
    readonly userId: string;
    readonly email: string;
    readonly displayName: string;
  }): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: intent.userId },
      select: { id: true, isActive: true, localPasswordHash: true },
    });
    // Deleted or deactivated between commit and delivery: nothing to hand over, and
    // mailing credentials for a closed account is exactly what this package forbids.
    if (user === null || !user.isActive) return false;
    // Somebody provisioned the account meanwhile (admin reset): never overwrite.
    if (user.localPasswordHash !== null) return false;

    const { temporaryPassword, localPasswordHash } = await prepareTemporaryPassword(
      this.hibpChecker,
    );
    const claimed = await this.prisma.user.updateMany({
      where: { id: intent.userId, isActive: true, localPasswordHash: null },
      data: { localPasswordHash, mustChangePassword: true, isLocalOnly: true },
    });
    if (claimed.count === 0) return false;

    const emailed = await sendTemporaryPasswordEmail({
      settingsService: this.settingsService,
      mailTransport: this.mailTransport,
      toAddress: intent.email,
      displayName: intent.displayName,
      temporaryPassword,
    });
    if (!emailed) {
      /*
        The account is now provisioned with a password nobody received. Rolling the
        credential back is the honest choice: it keeps "has a password" equivalent to
        "somebody was told it", and the retry issues a fresh one.
      */
      await this.prisma.user.updateMany({
        where: { id: intent.userId, localPasswordHash },
        data: { localPasswordHash: null },
      });
      throw new Error('temporary_password_delivery_channel_unavailable');
    }
    return true;
  }
}

function describeError(error: unknown): string {
  const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return value.slice(0, 300);
}
