import { PrismaService } from '../../common/prisma/prisma.service';
import { requireBusinessHoursCalendar } from './load-business-hours-calendar';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaError } from './sla.error';
import { toCalendarSnapshot } from './to-sla-snapshots';
import type { SlaMutationContext } from './sla.types';

export async function deleteBusinessHoursCalendar(
  prisma: PrismaService,
  calendarId: string,
  reason: string,
  context: SlaMutationContext,
): Promise<void> {
  const current = await requireBusinessHoursCalendar(prisma, calendarId);
  const profileCount = await prisma.slaProfile.count({
    where: { calendarId },
  });
  if (profileCount > 0) {
    throw new SlaError('CALENDAR_IN_USE');
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.businessHoursCalendar.delete({ where: { id: calendarId } });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.delete,
      entityType: slaChangeLogEntityTypes.calendar,
      entityId: calendarId,
      reason,
      before: toCalendarSnapshot(current),
      after: {},
      actorUserId: context.actorUserId,
    });
  });
}
