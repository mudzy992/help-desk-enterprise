import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import {
  problemNoticeDedupeKey,
  problemNoticeMaxAttempts,
  problemNoticePayload,
  problemNoticeTopic,
  type ProblemNoticeIntentInput,
} from './problem-notice-outbox';

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/**
 * W7.42 (BA-problems-21): the write side of problem notices.
 *
 * Callers state the intent; this service records it in the outbox. Nothing here
 * talks to SMTP or to the notification tables, so the request that changed the
 * problem only pays for one insert.
 */
@Injectable()
export class ProblemNoticeService {
  private readonly logger = new Logger(ProblemNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
  ) {}

  /**
   * Inside the transaction that changes the problem: the intent commits with the
   * change or not at all. A failed insert is a database failure, not a delivery
   * failure, so it is allowed to roll the command back.
   */
  async enqueue(
    transaction: Prisma.TransactionClient,
    intents: readonly ProblemNoticeIntentInput[],
  ): Promise<void> {
    for (const intent of intents) {
      await this.outbox.enqueue(transaction, {
        topic: problemNoticeTopic,
        dedupeKey: problemNoticeDedupeKey(intent),
        payload: problemNoticePayload(intent),
        maxAttempts: problemNoticeMaxAttempts,
      });
    }
  }

  /**
   * For a command that spans several transactions (a resolution run prepares,
   * changes the status and resolves tickets separately). The intent is still
   * written before any delivery is attempted; only a crash in the microseconds
   * between the commit and this call can lose it.
   *
   * The enqueue is best effort here on purpose: the user's write already
   * committed, so it must not be reported as failed because the notice could not
   * be recorded. The warning names the intent so an operator can see it.
   */
  async enqueueAfterCommit(intents: readonly ProblemNoticeIntentInput[]): Promise<void> {
    try {
      await this.enqueue(this.prisma as unknown as Prisma.TransactionClient, intents);
    } catch (error) {
      this.logger.warn(
        `problem_notice_enqueue_failed kinds=${intents.map((intent) => intent.kind).join(',')} reason=${errorText(error)}`,
      );
    }
  }
}
