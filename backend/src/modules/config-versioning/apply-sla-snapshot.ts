import type {
  TicketImpact,
  TicketUrgency,
} from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { ConfigSnapshot } from './config-versioning.types';

export async function applySlaSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
): Promise<void> {
  for (const calendar of snapshot.sla.calendars) {
    await transaction.businessHoursCalendar.upsert({
      where: { id: calendar.id },
      create: {
        id: calendar.id,
        key: calendar.key,
        name: calendar.name,
        timezone: calendar.timezone,
        weeklyHours: calendar.weeklyHours as Prisma.InputJsonValue,
        isActive: calendar.isActive,
      },
      update: {
        key: calendar.key,
        name: calendar.name,
        timezone: calendar.timezone,
        weeklyHours: calendar.weeklyHours as Prisma.InputJsonValue,
        isActive: calendar.isActive,
      },
    });
    await transaction.calendarHoliday.deleteMany({
      where: { calendarId: calendar.id },
    });
    if (calendar.holidays.length > 0) {
      await transaction.calendarHoliday.createMany({
        data: calendar.holidays.map((holiday) => ({
          calendarId: calendar.id,
          date: new Date(`${holiday.date}T00:00:00.000Z`),
          name: holiday.name,
        })),
      });
    }
  }
  for (const profile of snapshot.sla.profiles) {
    await transaction.slaProfile.upsert({
      where: { id: profile.id },
      create: {
        id: profile.id,
        key: profile.key,
        name: profile.name,
        description: profile.description,
        calendarId: profile.calendarId,
        isActive: profile.isActive,
      },
      update: {
        key: profile.key,
        name: profile.name,
        description: profile.description,
        calendarId: profile.calendarId,
        isActive: profile.isActive,
      },
    });
  }
  const ruleIds = snapshot.sla.rules.map((rule) => rule.id);
  await transaction.slaRule.deleteMany({
    where: ruleIds.length === 0 ? {} : { id: { notIn: [...ruleIds] } },
  });
  for (const rule of snapshot.sla.rules) {
    await transaction.slaRule.upsert({
      where: { id: rule.id },
      create: { ...rule },
      update: {
        slaProfileId: rule.slaProfileId,
        priority: rule.priority,
        responseMinutes: rule.responseMinutes,
        resolutionMinutes: rule.resolutionMinutes,
        evaluationOrder: rule.evaluationOrder,
        organizationalUnitId: rule.organizationalUnitId,
        serviceId: rule.serviceId,
      },
    });
  }
  const escalationIds = snapshot.sla.escalations.map((rule) => rule.id);
  await transaction.slaEscalationRule.deleteMany({
    where:
      escalationIds.length === 0 ? {} : { id: { notIn: [...escalationIds] } },
  });
  for (const rule of snapshot.sla.escalations) {
    await transaction.slaEscalationRule.upsert({
      where: { id: rule.id },
      create: { ...rule },
      update: {
        slaProfileId: rule.slaProfileId,
        triggerOffsetMinutes: rule.triggerOffsetMinutes,
        targetGroupId: rule.targetGroupId,
      },
    });
  }
  for (const rule of snapshot.sla.priorityMatrix) {
    const impact = rule.impact as TicketImpact;
    const urgency = rule.urgency as TicketUrgency;
    await transaction.priorityMatrixRule.upsert({
      where: { impact_urgency: { impact, urgency } },
      create: {
        id: rule.id,
        impact,
        urgency,
        priority: rule.priority,
      },
      update: {
        priority: rule.priority,
      },
    });
  }
}
