import { PrismaService } from '../../common/prisma/prisma.service';
import { addBusinessMinutes } from './add-business-minutes';
import { evaluateTicketSlaBreach } from './evaluate-ticket-sla-breach';
import { isSlaPauseStatus } from './is-sla-pause-status';
import { loadBusinessHoursCalendar } from './load-business-hours-calendar';
import { persistTicketSlaState } from './persist-ticket-sla-state';
import { resolveMatchingSlaRule } from './resolve-matching-sla-rule';
import type { SlaConfiguration, SlaRuleRecord } from './sla.types';
import type { TicketSlaStateRecord, TicketSlaTicketRef } from './ticket-sla.types';

export async function startTicketSlaTimers(
  prisma: PrismaService,
  ticket: TicketSlaTicketRef,
  configuration: SlaConfiguration,
  now: Date,
): Promise<TicketSlaStateRecord | null> {
  const service = await prisma.service.findUnique({
    where: { id: ticket.serviceId },
    select: { slaProfileId: true },
  });
  if (service?.slaProfileId == null) {
    return null;
  }
  const profile = await prisma.slaProfile.findUnique({
    where: { id: service.slaProfileId },
  });
  if (profile === null || profile.isActive !== true) {
    return null;
  }
  const rules = (await prisma.slaRule.findMany({
    where: { slaProfileId: profile.id },
  })) as SlaRuleRecord[];
  const rule = resolveMatchingSlaRule(rules, {
    priority: ticket.priority,
    serviceId: ticket.serviceId,
    organizationalUnitId: ticket.originUnitId,
  });
  if (rule === null) {
    return null;
  }
  const calendar = await loadBusinessHoursCalendar(prisma, profile.calendarId);
  if (calendar === null || !calendar.isActive) {
    return null;
  }
  const startedAt = ticket.createdAt;
  const paused = isSlaPauseStatus(ticket.status, configuration);
  return persistTicketSlaState(
    prisma,
    evaluateTicketSlaBreach(
      {
        ticketId: ticket.id,
        slaProfileId: profile.id,
        slaRuleId: rule.id,
        responseMinutes: rule.responseMinutes,
        resolutionMinutes: rule.resolutionMinutes,
        startedAt,
        responseDueAt: addBusinessMinutes(calendar, startedAt, rule.responseMinutes),
        resolutionDueAt: addBusinessMinutes(
          calendar,
          startedAt,
          rule.resolutionMinutes,
        ),
        respondedAt: null,
        resolutionCompletedAt: null,
        pausedAt: paused ? startedAt : null,
        pausedBusinessMinutes: 0,
        isResponseBreached: false,
        isResolutionBreached: false,
      },
      now,
    ),
  );
}
