import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ChangeAccessService } from '../change-access.service';
import { ChangeNotifier } from '../change-notifier';
import { changeEventActions } from '../changes.constants';
import { planChangeReminder } from './plan-change-reminders';
import { changeSweepBatch } from './change-sweep.constants';

export type ChangeSweepResult = { readonly skipped: string | null; readonly reminders: number; readonly overdue: number };

/**
 * Paket 3.4 (§14): start reminders and overrun warnings. The module switch is
 * checked first; the marks (`reminderSentAt`, `overdueNotifiedAt`) are set
 * with a conditional update, so concurrent workers send each notice once.
 */
@Injectable()
export class ChangeSweepService {
  private readonly logger = new Logger(ChangeSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChangeAccessService,
    private readonly notifier: ChangeNotifier,
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
      const claimed = await this.prisma.changeRequest.updateMany({
        where: { id: change.id, status: change.status, ...(kind === 'starting_soon' ? { reminderSentAt: null } : { overdueNotifiedAt: null }) },
        data: mark,
      });
      if (claimed.count === 0) continue;
      await this.prisma.changeEvent.create({ data: { changeId: change.id, action: changeEventActions.reminder, actorUserId: null, detail: { kind } } });
      try {
        if (kind === 'starting_soon') {
          await this.notifier.startingSoon(change.id);
          reminders += 1;
        } else {
          await this.notifier.overdue(change.id);
          overdue += 1;
        }
      } catch (error) {
        this.logger.warn(`change_sweep_notice_failed change=${change.id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (reminders > 0 || overdue > 0) this.logger.log(`change_sweep reminders=${reminders} overdue=${overdue}`);
    return { skipped: null, reminders, overdue };
  }
}
