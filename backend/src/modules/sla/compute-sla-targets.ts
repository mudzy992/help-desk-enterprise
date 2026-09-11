import { PrismaService } from '../../common/prisma/prisma.service';
import { addBusinessMinutes } from './add-business-minutes';
import { requireBusinessHoursCalendar } from './load-business-hours-calendar';
import { requireSlaProfile } from './load-sla-profile';
import { resolveMatchingSlaRule } from './resolve-matching-sla-rule';
import { SlaError } from './sla.error';
import type { ResolveSlaTargetsInput, SlaTargetsResponse } from './sla.types';

export async function computeSlaTargets(
  prisma: PrismaService,
  input: ResolveSlaTargetsInput,
): Promise<SlaTargetsResponse> {
  const profile = await requireSlaProfile(prisma, input.slaProfileId);
  const rules = await prisma.slaRule.findMany({
    where: { slaProfileId: profile.id },
  });
  const rule = resolveMatchingSlaRule(rules, input);
  if (rule === null) {
    throw new SlaError('NO_MATCHING_RULE');
  }
  const calendar = await requireBusinessHoursCalendar(prisma, profile.calendarId);
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    throw new SlaError('INVALID_SLA_TARGETS');
  }
  const responseDueAt = addBusinessMinutes(
    calendar,
    startedAt,
    rule.responseMinutes,
  );
  const resolutionDueAt = addBusinessMinutes(
    calendar,
    startedAt,
    rule.resolutionMinutes,
  );
  return {
    slaProfileId: profile.id,
    slaRuleId: rule.id,
    calendarId: calendar.id,
    priority: rule.priority,
    responseMinutes: rule.responseMinutes,
    resolutionMinutes: rule.resolutionMinutes,
    startedAt: startedAt.toISOString(),
    responseDueAt: responseDueAt.toISOString(),
    resolutionDueAt: resolutionDueAt.toISOString(),
  };
}
