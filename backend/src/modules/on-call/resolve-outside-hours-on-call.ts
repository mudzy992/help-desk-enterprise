import type { PrismaService } from '../../common/prisma/prisma.service';
import { countBusinessMinutes } from '../sla/count-business-minutes';
import { loadBusinessHoursCalendar } from '../sla/load-business-hours-calendar';
import { isOnCallEnabled, loadOnCallScheduleContext, resolveContextAt } from './on-call-data';

/**
 * Paket 2.9 (K3, §4.3): the on-call agent who should get a new ticket of
 * `groupId`, or null. Only when the feature is on, the group's schedule is
 * active with `autoAssignOutsideHours`, and `at` is outside the business hours
 * of the service's SLA calendar. A service without an SLA profile has no
 * business hours to be outside of → null (the normal strategy applies).
 */
export async function resolveOutsideHoursOnCallAssignee(
  prisma: PrismaService,
  input: { readonly groupId: string; readonly serviceId: string; readonly at?: Date },
): Promise<string | null> {
  const at = input.at ?? new Date();
  const schedule = await prisma.onCallSchedule.findUnique({
    where: { groupId: input.groupId },
    select: { isActive: true, autoAssignOutsideHours: true },
  });
  if (schedule === null || !schedule.isActive || !schedule.autoAssignOutsideHours) return null;
  if (!(await isOnCallEnabled(prisma))) return null;
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: { slaProfile: { select: { calendarId: true } } },
  });
  const calendarId = service?.slaProfile?.calendarId;
  if (calendarId === undefined) return null;
  const calendar = await loadBusinessHoursCalendar(prisma, calendarId);
  if (calendar === null || !calendar.isActive) return null;
  if (countBusinessMinutes(calendar, at, new Date(at.getTime() + 60_000)) > 0) return null;
  const context = await loadOnCallScheduleContext(prisma, input.groupId, { from: at, to: new Date(at.getTime() + 1) });
  return context === null ? null : resolveContextAt(context, at).userId;
}
