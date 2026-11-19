import { Injectable, Logger } from '@nestjs/common';
import { TransactionalOutboxService } from '../../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ChangeAccessService } from '../change-access.service';
import { changeEventActions } from '../changes.constants';
import { enqueueChangeReminder, changeReminderOccurrence } from './change-reminder-outbox';
import { planChangeReminder } from './plan-change-reminders';
import { changeSweepBatch } from './change-sweep.constants';

export type ChangeSweepResult = { readonly skipped: string | null; readonly reminders: number; readonly overdue: number };

/**
 * Paket 3.4 (§14): start reminders and overrun warnings. The module switch is
 * checked first; the marks (`reminderSentAt`, `overdueNotifiedAt`) are set
 * with a conditional update, so concurrent workers send each notice once.
 *
 * W7.48 (BA-changes-07): the mark and the delivery intent are written in one
 * transaction. The mark therefore means "persisted, retryable intent", not
 * "probably sent": a failed delivery is retried by the outbox instead of
 * disappearing while the mark blocks the next sweep.
 */
@Injectable()
export class ChangeSweepService {
  private readonly logger = new Logger(ChangeSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChangeAccessService,
    private readonly outbox: TransactionalOutboxService,
  ) {}

  async run(now: Date = new Date()): Promise<ChangeSweepResult> {
    if (!(await this.access.isEnabled())) return { skipped: 'module_disabled', reminders: 0, overdue: 0 };
    const configuration = await this.access.configuration();
    const hours = configuration.reminderHoursBeforeStart;
    const candidates = await this.prisma.changeRequest.findMany({
      where: {
        OR: [
          ...(hours > 0
            ? [{ status: 'SCHEDULED' as const, reminderSentAt: null, plannedStart: { gt: now, lte: new Date(now.getTime() + hours * 3_600_000) } }]
            : []),
          { status: 'IMPLEMENTING' as const, overdueNotifiedAt: null, plannedEnd: { lt: now } },
        ],
      },
      select: { id: true, status: true, plannedStart: true, plannedEnd: true, reminderSentAt: true, overdueNotifiedAt: true },
      orderBy: { plannedStart: 'asc' },
      take: changeSweepBatch,
    });
    let reminders = 0;
    let overdue = 0;
    for (const change of candidates) {
      const kind = planChangeReminder(change, now, hours);
      if (kind === null) continue;
      const mark = kind === 'starting_soon' ? { reminderSentAt: now } : { overdueNotifiedAt: now };
      const occurrence = changeReminderOccurrence(kind, change);
      let claimed = false;
      try {
        claimed = await this.prisma.$transaction(async (transaction) => {
          const updated = await transaction.changeRequest.updateMany({
            where: { id: change.id, status: change.status, ...(kind === 'starting_soon' ? { reminderSentAt: null } : { overdueNotifiedAt: null }) },
            data: mark,
          });
          if (updated.count === 0) return false;
          await transaction.changeEvent.create({ data: { changeId: change.id, action: changeEventActions.reminder, actorUserId: null, detail: { kind } } });
          await enqueueChangeReminder(this.outbox, transaction, { changeId: change.id, kind, occurrence });
          return true;
        });
      } catch (error) {
        // The transaction rolled back, so the mark is still empty and the next
        // sweep retries; one bad change must not block the rest of the batch.
        this.logger.warn(`change_sweep_enqueue_failed change=${change.id} reason=${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (!claimed) continue;
      if (kind === 'starting_soon') {
        reminders += 1;
      } else {
        overdue += 1;
      }
    }
    if (reminders > 0 || overdue > 0) this.logger.log(`change_sweep reminders=${reminders} overdue=${overdue}`);
    return { skipped: null, reminders, overdue };
  }
}
